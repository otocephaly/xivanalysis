import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {ActionLink, DataLink} from 'components/ui/DbLink'
import Rotation from 'components/ui/Rotation'
import {Action} from 'data/ACTIONS'
import {Attribute, Event, Events} from 'event'
import {Analyser} from 'parser/core/Analyser'
import {EventHook} from 'parser/core/Dispatcher'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import Downtime from 'parser/core/modules/Downtime'
import {GlobalCooldown} from 'parser/core/modules/GlobalCooldown'
import {Timeline} from 'parser/core/modules/Timeline'
import React from 'react'
import {Table, Button, Message} from 'semantic-ui-react'
import CastTime from '../CastTime'
import {Data} from '../Data'
import DISPLAY_ORDER from '../DISPLAY_ORDER'
import ABCTableFilterComponent from './Component'

//value to be added to the gcd to avoid false positives. 100ms for caster tax, 50ms for gcd jitter.
const GCD_JITTER_OFFSET = 50
const GCD_CASTER_TAX_OFFSET = 100
const DEFAULT_ACTION_ANIMATION_LOCK = 750
const OGCD_OFFSET = 800 //used to either assign blame to standing around or weaving

interface Window {
	start: number,
	startAction: Events['action'],
	stop?: number,
	stopAction?: Events['action'],
	gcdTime: number, //time it takes until the next action is available. In this module, if cast time > GCD, cast time is GCD
	availableOGCDTime: number, //this is used to determine whether the action allows for more OGCDs, e.g. cast vs action
	doNothingForegivness: number, //allowances based on time dead, interruptions, oGCDs
	isDeath: boolean,
	interruptedActions?: Action[],
	actions: Array<Events['action']>, //used to track oGCDs for weaves
}

interface AnimationLock {
	actionID: Action['id'],
	timeLocked: number,
}

const ABC_TABLE_HEADERS = {
	TIMESTAMP: <><Trans id="core.always-be-casting-table.timestamp-header">Timestamp</Trans><br/>
		(<Trans id="core.always-be-casting-table.duration-header">Time between executed GCDs</Trans>)</>,
	TIMESTAMP_DEAD: <><Trans id="core.always-be-casting-table.timestamp-dead-header">Time of Death</Trans><br/>
		(<Trans id="core.always-be-casting-table.duration-dead-header">Total time dead until <DataLink status={'TRANSCENDENT'} /> falls off.</Trans>)</>,
	ACTIONS: <Trans id="core.always-be-casting-table.action-header">Relevant action(s)</Trans>,
	WEAVE: <Trans id="core.always-be-casting-table.weaving-header"># of Weaves</Trans>,
	INTERRUPT: <><Trans id="core.always-be-casting-table.interrupted-header">Interrupted Actions</Trans></>,
	DO_NOTHING: <><Trans id="core.always-be-casting-table.nothing-header">Other GCD Issues</Trans></>,

}

export const ABC_TABLE_NOTES = {
	WEAVE_NOTE: <><Trans id="core.always-be-casting-table.notes-weaves">Weaves are included here if there are more than the maxmimum that you can weave. Weaves are not included here if you do the less than maximum but end up clipping your next GCD.</Trans></>,
	INTERRUPT_NOTE: <><Trans id="core.always-be-casting-table.notes-interruptions">Interruptions are included here regardless of ABC impact to provide additional context.</Trans></>,
	DO_NOTHING_NOTE: <><Trans id="core.always-be-casting-table.notes-nothing">Other GCD Issues are flagged if they can't be reasonably explained fully by weaving, death, or interrupts.</Trans></>,
	DEATH_NOTE: <><Trans id="core.always-be-casting-table.notes-death">Deaths are included here to provide additional context for the fight. Please note that this time is not included in the GCD uptime in the above ABC checklist.</Trans></>,
}

export default class ABCTable extends Analyser {
	static override handle = 'alwaysbecastingtable'
	static override title = t('core.always-be-casting-table.title')`Always Be Casting (ABC) Fundamentals`
	static override displayOrder = DISPLAY_ORDER.ABC_TABLE

	@dependency private timeline!: Timeline
	@dependency protected gcd!: GlobalCooldown
	@dependency protected downtime!: Downtime
	@dependency protected data!: Data
	@dependency protected castTime!: CastTime

	private noCastWindows: {current?: Window, history: Window[]} = {history: []}
	private hardCastStartTime: number | undefined = undefined
	private aliveHook: EventHook<Events['statusRemove']> | undefined = undefined
	private prepareTime: number = this.parser.pull.timestamp //used for interrupts
	//this is used to provide additional information on how long someone can actually access oGCDs for weaving
	protected actionsWithExtraAnimationLock: AnimationLock[] | undefined = undefined

	override initialise() {
		const playerFilter = filter<Event>().source(this.parser.actor.id)
		this.addEventHook(playerFilter.type('prepare'), this.onBegin)
		this.addEventHook(playerFilter.type('action'), this.onCast)
		this.addEventHook(playerFilter.type('interrupt'), this.onInterrupt)
		this.addEventHook({
			type: 'death',
			actor: this.parser.actor.id,
		}, this.onDeath)
		this.addEventHook('complete', this.onComplete)
	}

	private onBegin(event: Events['prepare']) {
		//don't want oGCDs resetting the window
		const action: Action | undefined = this.data.getAction(event.action)
		const actionIsOGCD: boolean = !this.data.getAction(event.action)?.onGcd
		if (action === undefined || actionIsOGCD) { return }
		//use this timestamp for interrupted actions
		this.prepareTime = event.timestamp
		//if coming from a hard cast, use this timestamp instead
		this.hardCastStartTime = event.timestamp
	}

	private onCast(event: Events['action']) {
		const action: Action | undefined = this.data.getAction(event.action)
		if (action === undefined) { return }
		if (action.autoAttack) { return }

		//if an oGCD, just add it to our list of actions
		const actionIsOGCD: boolean = !action.onGcd
		if (actionIsOGCD && this.noCastWindows.current !== undefined) {
			this.noCastWindows.current.actions.push(event)
			this.noCastWindows.current.doNothingForegivness += OGCD_OFFSET
			return
		}

		const casterTax: number = action.speedAttribute !== undefined && action.speedAttribute === Attribute.SPELL_SPEED
			//action.castTime !== undefined is always true since for some reason it comes as 0. so checking for attribute is preffered
			? GCD_CASTER_TAX_OFFSET : 0
		//if swift up, no cast time. if not, chest cast time if any. consider caster tax and animation lock
		//again can't trust castTime since it defaults to zero for some reason. used attribute instead
		const animationLock: number = this.actionsWithExtraAnimationLock?.find(item => item.actionID === event.action)?.timeLocked ?? DEFAULT_ACTION_ANIMATION_LOCK
		const availableOGCDTime: number = casterTax
			+ Math.max(animationLock, (this.castTime.castForEvent(event) ?? animationLock))
		//take recast unless casttime is longer. this will also help with the cases of caster tax when recast = casttime
		let actionRecast: number = this.castTime.recastForEvent(event) ?? this.gcd.getDuration()
		actionRecast = (actionRecast > availableOGCDTime) ? actionRecast : availableOGCDTime

		let timeStamp = event.timestamp
		//coming from a hard cast, adjust for slidecasting
		if (this.hardCastStartTime != null) {
			timeStamp = this.hardCastStartTime
			this.hardCastStartTime = undefined
		}

		//don't check the time that you actually spent casting
		if (!this.noCastWindows.current) {
			this.noCastWindows.current = {
				start: timeStamp,
				startAction: event,
				gcdTime: actionRecast,
				availableOGCDTime: availableOGCDTime,
				doNothingForegivness: 0,
				actions: [],
				isDeath: false,
			}
			return
		}

		//check if it's been more than a gcd length
		this.checkAndSave(timeStamp, event)
		//this cast is our new last cast
		this.noCastWindows.current = {
			start: timeStamp,
			startAction: event,
			gcdTime: actionRecast,
			availableOGCDTime: availableOGCDTime,
			doNothingForegivness: 0,
			actions: [],
			isDeath: false,
		}
	}

	private onInterrupt(event: Events['interrupt']) {
		if (this.noCastWindows.current === undefined) { return }
		const action: Action | undefined = this.data.getAction(event.action)
		if (action === undefined) { return }
		if (this.noCastWindows.current.interruptedActions === undefined) { this.noCastWindows.current.interruptedActions = [] }
		this.noCastWindows.current.interruptedActions?.push(action)
		this.noCastWindows.current.doNothingForegivness += event.timestamp - this.prepareTime
	}

	//track how long dead and show it for ease of reference
	private onDeath(event: Events['death']) {
		if (this.noCastWindows.current === undefined) { return }
		//want to start death event when applicable
		this.checkAndSaveDeath(event)

		this.aliveHook = this.addEventHook(
			filter<Event>()
				.target(this.parser.actor.id)
				.type('statusRemove')
				.status(this.data.statuses.TRANSCENDENT.id),
			this.onResurrect,
		)
	}

	private onResurrect(event: Events['statusRemove']) {
		if (this.noCastWindows.current === undefined) { return }
		if (this.aliveHook !== undefined) {
			this.removeEventHook(this.aliveHook)
			this.aliveHook = undefined
		}
		//want to end death event when no longer applicable
		this.checkAndSaveDeath(event)
	}

	/**
	 * Checks whether there was a violation and if so, pushes it, otherwise closes it
	 * @param {number} endTime time action is delivered to close the window
	 * @param {Events['action']} eventAction ending action. Optional only in the event of the end of the fight
	 */
	private checkAndSave(endTime: number, event?: Events['action']) {
		//no window no problem
		const tracker = this.noCastWindows
		if (tracker.current === undefined) { return }

		//return and reset if no violation
		if (!(endTime - tracker.current.start > tracker.current.gcdTime + GCD_JITTER_OFFSET
				|| (tracker.current.interruptedActions !== undefined && tracker.current.interruptedActions?.length !== 0))) {
			tracker.current = undefined
			return
		}

		// Close the window
		tracker.current.stop = endTime
		if (event !== undefined) { tracker.current.stopAction = event }
		tracker.history.push(tracker.current)
		tracker.current = undefined
	}

	//used to pretend a death event is actually an action to separate out things
	private checkAndSaveDeath(event: Events['death'] | Events['statusRemove']) {
		const actor: string = event.type === 'death' ? event.actor : event.target
		//fake death as an action
		const deathAsActionEvent: Events['action'] = {
			...event,
			type: 'action',
			action: this.data.actions.RAISE.id,
			source: actor,
			target: actor,
		}

		//check if it's been more than a gcd length since death started
		this.checkAndSave(event.timestamp, deathAsActionEvent)
		//this cast is our new last cast
		this.noCastWindows.current = {
			start: event.timestamp,
			startAction: deathAsActionEvent,
			gcdTime: 0,
			availableOGCDTime: 0,
			doNothingForegivness: 0,
			actions: [],
			isDeath: event.type === 'death',
		}
	}

	/**
	 * takes the base assumptions from the window and returns the amount of time the individual was doing nothing
	 * @param window window in which you suspect there could be someone doing nothing
	 * @returns amount of time in which someone is doing nothing or null if 0 or less
	 */
	private determineDoingNothing(window: Window): number | null {
		const windowLength: number = (window.stop ?? window.start) - window.start
		const maxAllowableTime: number = //earliest time given weaving and actual GCD
			Math.max(window.doNothingForegivness + window.availableOGCDTime, window.gcdTime) + GCD_JITTER_OFFSET
		if (windowLength > maxAllowableTime && !window.isDeath) {
			//for display purposes, include GCD jitter and caster tax so it doesn't look like we're penalizing for pennies
			return (windowLength - maxAllowableTime + GCD_JITTER_OFFSET)
		}
		return null
	}

	/**
	 * Returns true if the window contains too many of weaves
	 */
	private determineBadWeave(window: Window): boolean {
		//want only whole available oGCDs during window
		const availableOGCDs: number = Math.max(Math.floor((window.gcdTime - window.availableOGCDTime) / OGCD_OFFSET), 0)
		const checkIfBad = window.actions.length > availableOGCDs
		return checkIfBad
	}

	private onComplete(event: Events['complete']) {
		//finish up
		this.checkAndSave(event.timestamp)

		// Filter out periods where you got stunned, boss is untargetable, etc, or windows with negative durations
		this.noCastWindows.history = this.noCastWindows.history.filter(windows => {
			const duration = this.downtime.getDowntime(
				windows.start,
				windows.stop ?? windows.start,
			)
			return duration === 0
				&& (
					((windows.stop ?? windows.start) - windows.start > windows.gcdTime + GCD_JITTER_OFFSET)
					|| (windows.interruptedActions !== undefined && windows.interruptedActions?.length !== 0)
				)
		})
	}

	override output() {
		//weaves
		const badWeaves: Window[] = this.noCastWindows.history.filter(window => this.determineBadWeave(window))
		const badWeavesBoolean: boolean = badWeaves.length !== 0
		const weaveTable: JSX.Element | null = !badWeavesBoolean ? null :
			<>
				<Message info>
					{ABC_TABLE_NOTES.WEAVE_NOTE}
				</Message>
				<Table compact unstackable celled collapsing>
					<Table.Header>
						<Table.Row>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.TIMESTAMP}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.WEAVE}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.ACTIONS}</Table.HeaderCell>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{badWeaves.map(badWeaveWindow => {
							return <Table.Row key={badWeaveWindow.start}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badWeaveWindow.start - this.parser.pull.timestamp, (badWeaveWindow.stop ?? badWeaveWindow.start) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badWeaveWindow.start)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badWeaveWindow.stop ?? badWeaveWindow.start)}</span>
									<br/>
									({this.parser.formatDuration((badWeaveWindow.stop ?? badWeaveWindow.start) - badWeaveWindow.start)})
								</Table.Cell>
								<Table.Cell>
									{badWeaveWindow.actions.length !== 0 ? badWeaveWindow.actions.length : null}
								</Table.Cell>
								<Table.Cell>
									<Rotation events={[
										...(badWeaveWindow.startAction !== undefined ? [badWeaveWindow.startAction] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...badWeaveWindow.actions,
										...(badWeaveWindow.stopAction !== undefined ? [badWeaveWindow.stopAction] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		//interrupts
		const badInterrupts: Window[] = this.noCastWindows.history.filter(window => window.interruptedActions !== undefined && window.interruptedActions.length !== 0)
		const badInterruptsBoolean: boolean = badInterrupts.length !== 0
		const interruptTable: JSX.Element | null = !badInterruptsBoolean ? null :
			<>
				<Message info>
					{ABC_TABLE_NOTES.INTERRUPT_NOTE}
				</Message>
				<Table compact unstackable celled collapsing>
					<Table.Header>
						<Table.Row>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.TIMESTAMP}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.INTERRUPT}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.ACTIONS}</Table.HeaderCell>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{badInterrupts.map(badInterruptWindow => {
							return <Table.Row key={badInterruptWindow.start}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badInterruptWindow.start - this.parser.pull.timestamp, (badInterruptWindow.stop ?? badInterruptWindow.start) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badInterruptWindow.start)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badInterruptWindow.stop ?? badInterruptWindow.start)}</span>
									<br/>
									({this.parser.formatDuration((badInterruptWindow.stop ?? badInterruptWindow.start) - badInterruptWindow.start)})
								</Table.Cell>
								<Table.Cell>
									{badInterruptWindow.interruptedActions?.map(interruptedAction => {
										return <><ActionLink key={interruptedAction.id} {...interruptedAction} /><br/></>
									})}
								</Table.Cell>
								<Table.Cell>
									<Rotation events={[
										...(badInterruptWindow.startAction !== undefined ? [badInterruptWindow.startAction] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...badInterruptWindow.actions,
										...(badInterruptWindow.stopAction !== undefined ? [badInterruptWindow.stopAction] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		//deaths
		const badDeaths: Window[] = this.noCastWindows.history.filter(window => window.isDeath)
		const badDeathsBoolean: boolean = badDeaths.length !== 0
		const deathTable: JSX.Element | null = !badDeathsBoolean ? null :
			<>
				<Message info>
					{ABC_TABLE_NOTES.DEATH_NOTE}
				</Message>
				<Table compact unstackable celled collapsing>
					<Table.Header>
						<Table.Row>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.TIMESTAMP_DEAD}</Table.HeaderCell>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{badDeaths.map(badDeathsWindow => {
							return <Table.Row key={badDeathsWindow.start}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badDeathsWindow.start - this.parser.pull.timestamp, (badDeathsWindow.stop ?? badDeathsWindow.start) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badDeathsWindow.start)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badDeathsWindow.stop ?? badDeathsWindow.start)}</span>
									<br/>
									({this.parser.formatDuration((badDeathsWindow.stop ?? badDeathsWindow.start) - badDeathsWindow.start)})
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		//doing nothing
		const badDoNothing: Window[] = this.noCastWindows.history.filter(window => this.determineDoingNothing(window) !== null)
		const badDoNothingBoolean: boolean = badDoNothing.length !== 0
		const doNothingTable: JSX.Element | null = !badDoNothingBoolean ? null :
			<>
				<Message info>
					{ABC_TABLE_NOTES.DO_NOTHING_NOTE}
				</Message>
				<Table compact unstackable celled collapsing>
					<Table.Header>
						<Table.Row>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.TIMESTAMP}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.DO_NOTHING}</Table.HeaderCell>
							<Table.HeaderCell>{ABC_TABLE_HEADERS.ACTIONS}</Table.HeaderCell>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{badDoNothing.map(doingNothingWindow => {
							//take time between GCDs and remove recast time, caster tax (if any) and gcd jitters, forgive anything that needs forgiving (oGCDs, etc)
							const doingNothingTime = this.determineDoingNothing(doingNothingWindow)
							const doingNothingTimeFormatted = doingNothingTime !== null ? this.parser.formatDuration(doingNothingTime) : null
							return <Table.Row key={doingNothingWindow.start}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(doingNothingWindow.start - this.parser.pull.timestamp, (doingNothingWindow.stop ?? doingNothingWindow.start) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(doingNothingWindow.start)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(doingNothingWindow.stop ?? doingNothingWindow.start)}</span>
									<br/>
									({this.parser.formatDuration((doingNothingWindow.stop ?? doingNothingWindow.start) - doingNothingWindow.start)})
								</Table.Cell>
								<Table.Cell>
									{doingNothingTimeFormatted}
								</Table.Cell>
								<Table.Cell>
									<Rotation events={[
										...(doingNothingWindow.startAction !== undefined ? [doingNothingWindow.startAction] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...doingNothingWindow.actions,
										...(doingNothingWindow.stopAction !== undefined ? [doingNothingWindow.stopAction] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		//return for rendering
		const ABCTablePlaceHolder = {
			weaves: weaveTable,
			interrupts: interruptTable,
			deaths: deathTable,
			doNothing: doNothingTable,
		}

		// Rendering is in a specialised component so it's got some state to work with
		return <ABCTableFilterComponent ABCTables={ABCTablePlaceHolder}/>
	}
}
