import {t} from '@lingui/macro'
import {Plural, Trans} from '@lingui/react'
import {ActionLink, DataLink} from 'components/ui/DbLink'
import {NormalisedMessage} from 'components/ui/NormalisedMessage'
import {Rotation} from 'components/ui/Rotation'
import styles from 'components/ui/Rotation.module.css'
import {Action} from 'data/ACTIONS'
import {iconUrl} from 'data/icon'
import {Attribute, Event, Events} from 'event'
import {Analyser} from 'parser/core/Analyser'
import {EventHook} from 'parser/core/Dispatcher'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {Downtime} from 'parser/core/modules/Downtime'
import {GlobalCooldown} from 'parser/core/modules/GlobalCooldown'
import {Timeline} from 'parser/core/modules/Timeline'
import {ReactNode} from 'react'
import {Table, Button, Message} from 'semantic-ui-react'
import {CastTime} from '../CastTime'
import {Checklist, Requirement, Rule} from '../Checklist'
import {Data} from '../Data'
import {DISPLAY_ORDER} from '../DISPLAY_ORDER'
import {ABCTableExport} from './Component'
import {Severity, SEVERITY, SeverityTiers, Suggestions, TieredSuggestion} from '../Suggestions'

// value to be added to the gcd to avoid false positives. 100ms for caster tax, 50ms for gcd jitter.
const GCD_JITTER_OFFSET: number = 50
const GCD_CASTER_TAX_OFFSET: number = 100
const DEFAULT_ACTION_ANIMATION_LOCK: number = 750
const OGCD_OFFSET: number = 800 // used to either assign blame to standing around or weaving
const REACTION_TIME: number = 250 // used to verify whether the first action was reasonable to wait on. i.e. did they start when the fight started? was it pulled early? how much did they wait from when the boss was available again

// rule thresholds
const UPTIME_TARGET: Severity = 98
const WEAVING_SEVERITY: SeverityTiers = {
	1: SEVERITY.MEDIUM,
	5: SEVERITY.MAJOR,
}

// icons
const ICON_WEAVING_ACTION: number = 1751

// constant notes
const ABC_TABLE_HEADERS = {
	TIMESTAMP: <><Trans id="core.abc.timestamp-header">Timestamp</Trans><br/>
		(<Trans id="core.abc.duration-header">Time between executed GCDs</Trans><br/>
		/ <Trans id="core.abc.expected-header">Expected GCD</Trans>)</>,
	TIMESTAMP_DEAD: <><Trans id="core.abc.timestamp-dead-header">Time of Death</Trans><br/>
		(<Trans id="core.abc.duration-dead-header">Total time dead until <DataLink status={'TRANSCENDENT'} /> falls off.</Trans>)</>,
	ACTIONS: <Trans id="core.abc.action-header">Relevant action(s)</Trans>,
	WEAVE: <Trans id="core.abc.weaving-header"># of Weaves</Trans>,
	INTERRUPT: <><Trans id="core.abc.interrupted-header">Interrupted Actions</Trans></>,
	DO_NOTHING: <><Trans id="core.abc.nothing-header">Other GCD Issues</Trans></>,
}

export const ABC_TABLE_NOTES = {
	WEAVE_NOTE: <><Trans id="core.abc.notes-weaves">Weaves are included here if there are more than the maxmimum that you can weave. Weaves are not included here if you do the less than maximum but end up clipping your next GCD.</Trans></>,
	INTERRUPT_NOTE: <><Trans id="core.abc.notes-interruptions">Interruptions are included here regardless of ABC impact to provide additional context.</Trans></>,
	DO_NOTHING_NOTE: <><Trans id="core.abc.notes-nothing">Other GCD Issues are flagged if they can't be reasonably explained fully by weaving, death, or interrupts.</Trans></>,
	DEATH_NOTE: <><Trans id="core.abc.notes-death">Deaths are included here to provide additional context for the fight. Please note that this time is not included in the GCD uptime in the above ABC checklist.</Trans></>,
}

//interfaces
export interface ABCWindow {
	leadingGCDTime: number,
	leadingGCDEvent?: Events['action'], // start action left undefined to allow for case where someone waited too long to start the fight after it had been initiated or downtime
	leadingGCDIcon?: ReactNode, // used if no start action noted
	trailingGCDTime?: number,
	trailingGCDEvent?: Events['action'],
	trailingGCDIcon?: ReactNode, // used if no ending action noted
	expectedGCDDuration: number, // time it takes until the next action is available. In this module, if cast time > GCD, cast time is GCD
	availableOGCDTime: number, // this is used to determine whether the action allows for more OGCDs, e.g. cast vs action
	doNothingForegivness: number, // allowances based on time dead, interruptions, oGCDs
	isDeath: boolean,
	interruptedActions?: Action[],
	actions: Array<Events['action']>, // used to track oGCDs for weaves
	ignoreWindowIncludingUptime: boolean // used to allow for overriding actions if not considered during uptime
}

export interface AnimationLock {
	actionID: Action['id'],
	timeLocked: number,
}

export class AlwaysBeCasting extends Analyser {
	static override handle = 'abc'
	static override title = t('core.abc.title')`Always Be Casting (ABC) Fundamentals`
	static override displayOrder = DISPLAY_ORDER.ABC_TABLE
	static override debug = false

	@dependency private timeline!: Timeline
	@dependency protected gcd!: GlobalCooldown
	@dependency protected downtime!: Downtime
	@dependency protected data!: Data
	@dependency protected castTime!: CastTime
	@dependency protected checklist!: Checklist
	@dependency protected suggestions!: Suggestions

	// debug options
	private debugShowOnlyViolations: boolean = false
	private checkInstance: number = 0

	// constant options
	protected ogcdOffset: number = OGCD_OFFSET
	private defaultActionAnimationLock: number = DEFAULT_ACTION_ANIMATION_LOCK
	private reactionTime: number = REACTION_TIME

	protected noCastWindows: {current?: ABCWindow, history: ABCWindow[]} = {history: []}
	private hardCastStartTime: number | undefined = undefined
	private aliveHook: EventHook<Events['statusRemove']> | undefined = undefined
	private prepareTime: number = this.parser.pull.timestamp //used for interrupts
	// this is used to provide additional information on how long someone can actually access oGCDs for weaving
	protected actionsWithExtraAnimationLock: AnimationLock[] | undefined = undefined
	// in case someone casts and then transcendence falls off
	private prematureCast: Events['action'] | undefined = undefined

	// some jobs might have exceptions where actions have an extra animation lock or need a lil more forgiveness
	protected ignoredActionIds: number[] = []
	protected additionalJitter: number = 0 // used for jobs with low cast times such as mnk

	// misc icons
	private deathIcon: ReactNode = <DataLink status="WEAKNESS" showName={false} iconSize={styles.gcdSize} />
	private rezIcon: ReactNode = <DataLink status="TRANSCENDENT" showName={false} iconSize={styles.gcdSize}/>
	private downtimeIcon: ReactNode = <DataLink status="TEMPORAL_DISPLACEMENT_INTERMISSION" showName={false} iconSize={styles.gcdSize} showTooltip={false}/>

	// ABC totals tracking
	private currentExcludedTime: number | undefined = undefined
	private totalExcludedTime: number = 0
	private timeSpentNotCasting: number = 0
	private firstCastHappened: boolean = false

	// checklist and suggestion items
	protected uptimeSeverity: Severity = UPTIME_TARGET
	protected weavingSeverity: SeverityTiers = WEAVING_SEVERITY
	protected weavingIcon: string = iconUrl(ICON_WEAVING_ACTION)

	// to allow for easy link within the suggestion
	protected moduleLink = (
		<a style={{cursor: 'pointer'}} onClick={() => this.parser.scrollTo(AlwaysBeCasting.handle)}>
			<NormalisedMessage message={AlwaysBeCasting.title}/>
		</a>
	)

	// suggestion content
	protected checkModule: ReactNode = <Trans id="core.abc.suggestion.check-module-link">
		Check the {this.moduleLink} module below for more detailed analysis.
	</Trans>
	protected gcdUptimeSuggestionContent: ReactNode = <><Trans id="core.abc.suggestion.uptime.content">
		Make sure you're always doing something. It's often better to make small
		mistakes while keeping the GCD rolling than it is to perform the correct
		rotation slowly.
	</Trans><br/>{this.checkModule}</>
	protected weavingSuggestionContent: ReactNode = <><Trans id="core.abc.suggestion.weaving.content">
		Avoid weaving more actions than you have time for in a single GCD window. Doing so will delay your next GCD, reducing possible uptime.
	</Trans><br/>{this.checkModule}</>

	// footer
	protected footer: ReactNode = <><Trans id="core.abc.notes-footer">
		The icon ({this.downtimeIcon}) has been added to actions to show when downtime has started or ended.
		A reaction time of {this.parser.formatDuration(this.reactionTime + this.ogcdOffset)} has been added after downtime, start of fight, or when <DataLink status="TRANSCENDENT" /> drops to track lost uptime when taking too long to get rolling again.
	</Trans></>

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

	/**
	 * used to determine whether the preparation event happened before the cast for ease of tracking start of GCD
	 * @param event preparation event that could determine whether it happened before the actual cast
	 */
	private onBegin(event: Events['prepare']) {
		// don't want oGCDs resetting the window
		const action: Action | undefined = this.data.getAction(event.action)
		const actionIsOGCD: boolean = !this.data.getAction(event.action)?.onGcd
		// Ignore actions we were told to ignore and oGCDs and not actions
		if (action === undefined) { return }
		if (actionIsOGCD) { return }
		if (this.ignoredActionIds.includes(action.id)) { return }
		// use this timestamp for interrupted actions
		this.prepareTime = event.timestamp
		// if coming from a hard cast, use this timestamp instead
		this.hardCastStartTime = event.timestamp
	}

	/**
	 * onCast will save the window if a GCD, otherwise add oGCD to the actions of the window
	 * @param event GCD or oGCD action that will be checked against and saved
	 */
	protected onCast(event: Events['action']) {
		const action: Action | undefined = this.data.getAction(event.action)
		if (this.aliveHook !== undefined) {
			this.prematureCast = event
			return
		}

		// if currently in downtime, disregard cast
		const tracker = this.noCastWindows.current
		if (tracker !== undefined && this.downtime.isDowntime(event.timestamp)) {
			return
		}

		// if not an action or autoattack or if specifically ignored, stop
		if (action === undefined) { return }
		if (action.autoAttack) { return }
		if (this.ignoredActionIds.includes(action.id)) { return }

		// if an oGCD, just add it to our list of actions
		const actionIsOGCD: boolean = !action.onGcd
		if (actionIsOGCD && this.noCastWindows.current !== undefined) {
			this.noCastWindows.current.actions.push(event)
			this.noCastWindows.current.doNothingForegivness += this.ogcdOffset
			return
		}

		// caster tax is considered if the cast is considered a spell
		// action.castTime !== undefined is always true since for some reason it comes as 0. so checking for attribute is preffered
		const casterTax: number = action.speedAttribute !== undefined && action.speedAttribute === Attribute.SPELL_SPEED
			? GCD_CASTER_TAX_OFFSET : 0
		// if swift up, no cast time. if not, check cast time if any. consider caster tax and animation lock
		// again can't trust castTime since it defaults to zero for some reason. used attribute instead
		const animationLock: number = this.actionsWithExtraAnimationLock?.find(item => item.actionID === event.action)?.timeLocked ?? this.defaultActionAnimationLock
		const availableOGCDTime: number = casterTax
			+ Math.max(animationLock, (this.castTime.castForEvent(event) ?? animationLock))
		// take recast unless casttime is longer. this will also help with the cases of caster tax when recast = casttime
		let actionRecast: number = this.castTime.recastForEvent(event) ?? this.gcd.getDuration()
		actionRecast = (actionRecast > availableOGCDTime) ? actionRecast : availableOGCDTime

		let timeStamp = event.timestamp
		// coming from a hard cast, adjust for slidecasting
		if (this.hardCastStartTime != null) {
			timeStamp = this.hardCastStartTime
			this.hardCastStartTime = undefined
		}

		// don't check the time that you actually spent casting
		if (!this.noCastWindows.current) {
			this.noCastWindows.current = {
				leadingGCDTime: timeStamp,
				leadingGCDEvent: event,
				expectedGCDDuration: actionRecast,
				availableOGCDTime: availableOGCDTime,
				doNothingForegivness: 0,
				actions: [],
				isDeath: false,
				ignoreWindowIncludingUptime: false,
			}
			return
		}

		// check if there was a significant delay since starting the fight
		if (!this.firstCastHappened) {
			this.checkAndSaveStartOfFight(event)
			this.firstCastHappened = true
		}
		// check if there was any downtime between casts
		this.checkAndSaveDowntime(this.noCastWindows.current.leadingGCDTime, event.timestamp)
		// check if it's been more than a gcd length
		this.checkAndSave(timeStamp, event)
		// this cast is our new last cast
		this.noCastWindows.current = {
			leadingGCDTime: timeStamp,
			leadingGCDEvent: event,
			expectedGCDDuration: actionRecast,
			availableOGCDTime: availableOGCDTime,
			doNothingForegivness: 0,
			actions: [],
			isDeath: false,
			ignoreWindowIncludingUptime: false,
		}
	}

	/**
	 * onInterrupt will save the event when there is an interruption noted even if not outside expectedGCDDuration
	 * @param event interruption event
	 */
	private onInterrupt(event: Events['interrupt']) {
		if (this.noCastWindows.current === undefined) { return }
		const action: Action | undefined = this.data.getAction(event.action)
		if (action === undefined) { return }
		if (this.noCastWindows.current.interruptedActions === undefined) { this.noCastWindows.current.interruptedActions = [] }
		this.noCastWindows.current.interruptedActions?.push(action)
		this.noCastWindows.current.doNothingForegivness += event.timestamp - this.prepareTime
	}

	/**
	 * will check and save death event if applicable
	 * @param event death event
	 */
	// track how long dead and show it for ease of reference
	private onDeath(event: Events['death']) {
		if (this.currentExcludedTime === undefined) { this.currentExcludedTime = event.timestamp }
		if (this.noCastWindows.current === undefined) { return }
		// check if there was a significant delay since starting the fight and then they died
		if (!this.firstCastHappened) {
			this.checkAndSaveStartOfFight(event)
			this.firstCastHappened = true
		}
		// want to start death event when applicable
		this.checkAndSaveDeath(event)

		this.aliveHook = this.addEventHook(
			filter<Event>()
				.target(this.parser.actor.id)
				.type('statusRemove')
				.status(this.data.statuses.TRANSCENDENT.id),
			this.onResurrect,
		)
	}

	/**
	 * onResurrect will close the window when transcendent falls off
	 * @param event transcendent falling off event
	 */
	private onResurrect(event: Events['statusRemove']) {
		if (this.currentExcludedTime !== undefined) {
			this.totalExcludedTime += event.timestamp - this.currentExcludedTime
			this.currentExcludedTime = undefined
		}
		if (this.noCastWindows.current === undefined) { return }
		if (this.aliveHook !== undefined) {
			this.removeEventHook(this.aliveHook)
			this.aliveHook = undefined
		}
		// want to end death event when no longer applicable
		this.checkAndSaveDeath(event)
		// can be a situation where the cast goes through before the status drops off, this is to help avoid that scenario
		if (this.prematureCast !== undefined) {
			this.onCast(this.prematureCast)
			this.prematureCast = undefined
		}
	}

	/**
	 * Checks whether there was a violation and if so, pushes it, otherwise closes it
	 * @param {number} endTime time action is delivered to close the window
	 * @param {Events['action']} event ending action. Optional only in the event of the end of the fight
	 */
	protected checkAndSave(endTime: number, event?: Events['action']) {
		// no window no problem
		const tracker = this.noCastWindows
		if (tracker.current === undefined) { return }

		// if window contained ignored actions, include it in excluded time
		if (tracker.current.ignoreWindowIncludingUptime && event !== undefined && event.type === 'action') {
			this.totalExcludedTime += endTime - tracker.current.leadingGCDTime
		}

		// consider if downtime is approaching, if so, add another GCD to expected GCD duration since it would take another whole GCD after the last one.
		// Note: we will be counting after the first GCD not the second for uptime purposes in the event they could have cast another
		const downtime: number = tracker.current.trailingGCDIcon === this.downtimeIcon ? this.gcd.getDuration() : 0
		// consider violation if not an interrupted action nor expected GCD time
		const violation: boolean = (
			// if difference between endTime and leading time is greater than expected plus additional time between downtime
			endTime - tracker.current.leadingGCDTime > tracker.current.expectedGCDDuration + GCD_JITTER_OFFSET + downtime + this.additionalJitter
			// if this event contains an interrupted action
			|| (tracker.current.interruptedActions !== undefined && tracker.current.interruptedActions?.length !== 0)
		)

		// debug print statements
		this.checkInstance += 1
		let instancePrint = `[${this.checkInstance}] `
		if (!violation && this.debugShowOnlyViolations) { return } // return if we don't want so show debug statements for non-violations
		if (violation && !this.debugShowOnlyViolations) {
			instancePrint = `[VIOLATION!] ` + instancePrint
		}
		if (endTime === this.parser.pull.timestamp + this.parser.pull.duration && tracker.current.isDeath) {
			// dead and fight ended
			this.debug(instancePrint + `Player died at ${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)} and stayed dead until EoF at ${this.parser.formatEpochTimestamp(endTime, 1)} for a total of ${endTime - tracker.current.leadingGCDTime}.`)
		} else if (tracker.current.isDeath) {
			// dead and fight didn't end
			this.debug(instancePrint + `Player died at ${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)} and ${this.data.statuses.TRANSCENDENT.name} dropped off at ${this.parser.formatEpochTimestamp(endTime, 1)} for a total of ${endTime - tracker.current.leadingGCDTime}.`)
		} else if (event === undefined && endTime === this.parser.pull.timestamp + this.parser.pull.duration && tracker.current.leadingGCDIcon === this.downtimeIcon) {
			// end of fight and last instance of anything was start or end of downtime
			this.debug(instancePrint + `Time between downtime (${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)}) and EoF (${this.parser.formatEpochTimestamp(endTime, 1)}) was ${endTime - tracker.current.leadingGCDTime}.`)
		} else if (event === undefined && tracker.current.leadingGCDIcon === this.downtimeIcon) {
			// both instances was downtime
			this.debug(instancePrint + `Time between downtimes (${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)} to ${this.parser.formatEpochTimestamp(endTime, 1)}) was ${endTime - tracker.current.leadingGCDTime}.`)
		} else if (tracker.current.leadingGCDIcon === this.downtimeIcon && event !== undefined) {
			// cast/death following downtime
			this.debug(instancePrint + `Expected delay following downtime at ${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)} until ${this.parser.formatEpochTimestamp(endTime, 1)} Est GCD/Recast: ${tracker.current.expectedGCDDuration} - Actual Duration: ${endTime - tracker.current.leadingGCDTime} OGCDs: ${tracker.current.actions.length} Interruptions: ${tracker.current.interruptedActions?.length ?? 0}`)
		} else if (tracker.current.leadingGCDEvent !== undefined) {
			// assumed successful cast
			this.debug(instancePrint + `GCD Action: ${this.data.getAction(tracker.current.leadingGCDEvent.action)?.name} - Est GCD/Recast: ${tracker.current.expectedGCDDuration} - Started: ${this.parser.formatEpochTimestamp(tracker.current.leadingGCDTime, 1)} - Ended: ${this.parser.formatEpochTimestamp(endTime, 1)} - Actual Duration: ${endTime - tracker.current.leadingGCDTime} - OGCDs: ${tracker.current.actions.length} - Interruptions: ${tracker.current.interruptedActions?.length ?? 0}`)
		} else {
			this.debug(`Something is awry`)
		}

		// return and reset if no violation
		if (!violation) {
			tracker.current = undefined
			return
		}

		// Close the window
		tracker.current.trailingGCDTime = endTime
		const violationTime: number = endTime - tracker.current.leadingGCDTime - tracker.current.expectedGCDDuration
		if (event !== undefined) { tracker.current.trailingGCDEvent = event }
		if (violationTime > 0) {
			this.timeSpentNotCasting += violationTime
			this.debug(instancePrint + `Not casting added: ${violationTime}`)
		}
		tracker.history.push(tracker.current)
		tracker.current = undefined
	}

	/**
	 * used to pretend a death event is actually an action to separate out things
	 * @param event either death or drop off of rez invuln
	 */
	private checkAndSaveDeath(event: Events['death'] | Events['statusRemove']) {
		// check if it's been more than a gcd length since death started
		// check if any downtime between last cast and death. don't want to double count downtime. this statement will also prioritize death during downtime since we assess at ToD
		if (this.noCastWindows.current !== undefined && !this.noCastWindows.current.isDeath) { this.checkAndSaveDowntime(this.noCastWindows.current.leadingGCDTime, event.timestamp) }
		// added to icon after in case it is saved during downtime
		if (this.noCastWindows.current !== undefined) { this.noCastWindows.current.trailingGCDIcon = (event.type === 'death' ? this.deathIcon : this.rezIcon) }
		this.checkAndSave(event.timestamp)
		// this cast is our new last cast
		this.noCastWindows.current = {
			leadingGCDTime: event.timestamp,
			leadingGCDIcon: event.type === 'death' ? this.deathIcon : this.rezIcon,
			expectedGCDDuration: event.type === 'statusRemove' ? this.reactionTime + this.ogcdOffset : 0, // to allow for gap closers and reaction time after status drops off
			availableOGCDTime: 0,
			doNothingForegivness: 0,
			actions: [],
			isDeath: event.type === 'death',
			ignoreWindowIncludingUptime: false,
		}
	}

	/**
	 * checks whether there was downtime in the stated window and acts as if those are cast events disregarding the whole window
	 * @param startTime start of the window you want to check downtime
	 * @param endTime end of the window you want to check downtime
	 */
	private checkAndSaveDowntime(startTime: number, endTime: number) {
		// check for downtime and remove from section but also handle instances where there was a violation between last cast with start of downtime and end of downtime with next cast (technically two events)
		const downtimeWindows = this.downtime.getDowntimeWindows(
			startTime,
			endTime,
		)
		const downtime = this.downtime.getDowntime(
			startTime,
			endTime,
		)
		if (downtimeWindows.length !== 0) {
			// remove downtime from uptime
			this.totalExcludedTime += downtime
			// want to check and save for each instance of downtime (there shouldn't be multiple, but if someone does nothing for a long time I guess it could happen)
			downtimeWindows.forEach(window => {
				const tracker = this.noCastWindows.current
				if (tracker !== undefined) { tracker.trailingGCDIcon = this.downtimeIcon }
				if (window.start === window.end) { return }
				this.checkAndSave(window.start)
				this.noCastWindows.current = {
					leadingGCDTime: window.end,
					leadingGCDIcon: this.downtimeIcon,
					expectedGCDDuration: this.reactionTime + this.ogcdOffset, // default to reaction time for when boss appears and allow time for a gap closer (1 oGCD)
					availableOGCDTime: 0,
					doNothingForegivness: 0,
					actions: [],
					isDeath: false,
					ignoreWindowIncludingUptime: false,
				}
			})
		}
	}

	private checkAndSaveStartOfFight(event: Events['action' | 'death']) {
		if (this.noCastWindows.current !== undefined) { return }
		if (event.timestamp <= this.parser.pull.timestamp) { return }
		// synth if first time
		this.noCastWindows.current = {
			leadingGCDTime: this.parser.pull.timestamp,
			leadingGCDIcon: this.downtimeIcon,
			expectedGCDDuration: this.reactionTime + this.ogcdOffset, // give benefit of early pull with reaction time and OGCD for gap close
			availableOGCDTime: 0,
			doNothingForegivness: 0,
			actions: [],
			isDeath: false,
			ignoreWindowIncludingUptime: false,
		}
	}

	/**
	 * takes the base assumptions from the window and returns the amount of time the individual was doing nothing
	 * @param window window in which you suspect there could be someone doing nothing
	 * @returns amount of time in which someone is doing nothing or null if 0 or less
	 */
	private determineDoingNothing(window: ABCWindow): number | null {
		const windowLength: number = (window.trailingGCDTime ?? window.leadingGCDTime) - window.leadingGCDTime
		const maxAllowableTime: number = // earliest time given weaving and actual GCD
			Math.max(window.doNothingForegivness + window.availableOGCDTime, window.expectedGCDDuration) + GCD_JITTER_OFFSET
		if (windowLength > maxAllowableTime && !window.isDeath) {
			// for display purposes, include GCD jitter and caster tax so it doesn't look like we're penalizing for pennies
			return (windowLength - maxAllowableTime + GCD_JITTER_OFFSET)
		}
		return null
	}

	/**
	 * Returns true if the window contains too many weaves
	 */
	protected determineBadWeave(window: ABCWindow): boolean {
		// want only whole available oGCDs during window
		const availableOGCDs: number = Math.max(Math.floor((window.expectedGCDDuration - window.availableOGCDTime) / this.ogcdOffset), 0)
		const checkIfBad = window.actions.length > availableOGCDs
		return checkIfBad
	}

	/**
	 * used at the end of the fight to determine the uptime percentage
	 * the calculation is fight duration less excluded time less time spent not casting as determined by violations noted in checkAndSave
	 * @returns uptime percentage
	 */
	private determineUptimePercentage(): number {
		let uptimePercent: number = 0
		if (this.parser.pull.duration !== this.totalExcludedTime) {
			uptimePercent = (this.parser.pull.duration - this.totalExcludedTime - this.timeSpentNotCasting) / (this.parser.pull.duration - this.totalExcludedTime) * 100
		}

		return uptimePercent
	}

	protected onComplete(event: Events['complete']) {
		// for ease of reference make trailing gcd icon into downtime icon. This will help with interrupted spells on end of fight
		if (this.noCastWindows.current !== undefined) { this.noCastWindows.current.trailingGCDIcon = this.downtimeIcon }
		// finish up
		this.checkAndSave(event.timestamp)

		// if nothing do nothing
		if (this.checkInstance === 0) { return }

		// if they were dead at the end, don't exclude this
		if (this.currentExcludedTime !== undefined) {
			this.totalExcludedTime += this.parser.pull.duration + this.parser.pull.timestamp - this.currentExcludedTime
			this.currentExcludedTime = undefined
		}

		// testing gcduptime
		const uptimePercent: number = this.determineUptimePercentage()

		// final debug statements
		// downtime debug
		if (this.debug) {
			this.downtime.getDowntimeWindows().forEach(
				window => {
					this.debug(`Downtime started ${this.parser.formatEpochTimestamp(window.start, 1)} and ended ${this.parser.formatEpochTimestamp(window.end, 1)} for a duration of ${window.end - window.start}.`)
				}
			)
		}
		this.debug(`Total fight duration: ${this.parser.pull.duration} (Start: ${this.parser.formatEpochTimestamp(this.parser.pull.timestamp)} - End: ${this.parser.formatEpochTimestamp(this.parser.pull.timestamp + this.parser.pull.duration)}) - Total excluded time: ${this.totalExcludedTime} - Time spent not casting: ${this.timeSpentNotCasting} - Uptime percent: ${uptimePercent}.`)

		const checklistFootnote =
			<Trans id="core.abc.additional-info-rule">
				Factors:
				<ul>
					<li>Total fight time: {this.parser.formatDuration(this.parser.pull.duration)}</li>
					<li>Downtime (including time dead): {this.parser.formatDuration(this.totalExcludedTime)}</li>
					<li>Time spent not casting: {this.parser.formatDuration(this.timeSpentNotCasting)}</li>
				</ul>
			</Trans>

		this.checklist.add(new Rule({
			name: <Trans id="core.abc.checklist.title">Always be casting</Trans>,
			description: this.gcdUptimeSuggestionContent,
			displayOrder: -1,
			requirements: [
				new Requirement({
					name: <Trans id="core.abc.checklist.gcd-uptime">GCD Uptime</Trans>,
					percent: uptimePercent,
				}),
			],
			target: this.uptimeSeverity,
			footnote: checklistFootnote,
		}))

		// weaving suggestion
		const badWeaves: ABCWindow[] = this.noCastWindows.history.filter(window => this.determineBadWeave(window))

		this.suggestions.add(new TieredSuggestion({
			icon: this.weavingIcon,
			content: this.weavingSuggestionContent,
			why: <Plural
				id="core.abc.weaving.why"
				value={badWeaves.length}
				_1="# instance of incorrect weaving"
				other="# instances of incorrect weaving"
			/>,
			tiers: this.weavingSeverity,
			value: badWeaves.length,
		}))
	}

	override output() {
		// if nothing do nothing
		if (this.noCastWindows.history.length === 0) { return }

		/**
		 * weaves table
		 */
		const badWeaves: ABCWindow[] = this.noCastWindows.history.filter(window => this.determineBadWeave(window))
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
							return <Table.Row key={badWeaveWindow.leadingGCDTime}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badWeaveWindow.leadingGCDTime - this.parser.pull.timestamp, (badWeaveWindow.trailingGCDTime ?? badWeaveWindow.leadingGCDTime) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badWeaveWindow.leadingGCDTime)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badWeaveWindow.trailingGCDTime ?? badWeaveWindow.leadingGCDTime)}</span>
									<br/>
									({this.parser.formatDuration((badWeaveWindow.trailingGCDTime ?? badWeaveWindow.leadingGCDTime) - badWeaveWindow.leadingGCDTime)} / {this.parser.formatDuration(badWeaveWindow.expectedGCDDuration)})
								</Table.Cell>
								<Table.Cell>
									{badWeaveWindow.actions.length !== 0 ? badWeaveWindow.actions.length : null}
								</Table.Cell>
								<Table.Cell>
									{<div className={styles.container}>{badWeaveWindow.leadingGCDIcon}</div>}
									<Rotation events={[
										...(badWeaveWindow.leadingGCDEvent !== undefined ? [badWeaveWindow.leadingGCDEvent] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...badWeaveWindow.actions,
										...(badWeaveWindow.trailingGCDEvent !== undefined ? [badWeaveWindow.trailingGCDEvent] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
									{<div className={styles.container}>{badWeaveWindow.trailingGCDIcon}</div>}
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
				<Message info>
					{this.footer}
				</Message>
			</>

		/**
		 * interrupts table
		 */
		const badInterrupts: ABCWindow[] = this.noCastWindows.history.filter(window => window.interruptedActions !== undefined && window.interruptedActions.length !== 0)
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
							return <Table.Row key={badInterruptWindow.leadingGCDTime}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badInterruptWindow.leadingGCDTime - this.parser.pull.timestamp, (badInterruptWindow.trailingGCDTime ?? badInterruptWindow.leadingGCDTime) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badInterruptWindow.leadingGCDTime)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badInterruptWindow.trailingGCDTime ?? badInterruptWindow.leadingGCDTime)}</span>
									<br/>
									({this.parser.formatDuration((badInterruptWindow.trailingGCDTime ?? badInterruptWindow.leadingGCDTime) - badInterruptWindow.leadingGCDTime)} / {this.parser.formatDuration(badInterruptWindow.expectedGCDDuration)})
								</Table.Cell>
								<Table.Cell>
									{badInterruptWindow.interruptedActions?.map(interruptedAction => {
										return <><ActionLink key={interruptedAction.id} {...interruptedAction} /><br/></>
									})}
								</Table.Cell>
								<Table.Cell>
									{<div className={styles.container}>{badInterruptWindow.leadingGCDIcon}</div>}
									<Rotation events={[
										...(badInterruptWindow.leadingGCDEvent !== undefined ? [badInterruptWindow.leadingGCDEvent] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...badInterruptWindow.actions,
										...(badInterruptWindow.trailingGCDEvent !== undefined ? [badInterruptWindow.trailingGCDEvent] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
									{<div className={styles.container}>{badInterruptWindow.trailingGCDIcon}</div>}
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		/**
		 * deaths table
		 */
		const badDeaths: ABCWindow[] = this.noCastWindows.history.filter(window => window.isDeath)
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
							return <Table.Row key={badDeathsWindow.leadingGCDTime}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(badDeathsWindow.leadingGCDTime - this.parser.pull.timestamp, (badDeathsWindow.trailingGCDTime ?? badDeathsWindow.leadingGCDTime) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badDeathsWindow.leadingGCDTime)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(badDeathsWindow.trailingGCDTime ?? badDeathsWindow.leadingGCDTime)}</span>
									<br/>
									({this.parser.formatDuration((badDeathsWindow.trailingGCDTime ?? badDeathsWindow.leadingGCDTime) - badDeathsWindow.leadingGCDTime)})
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
			</>

		/**
		 * doing nothing table
		 */
		const badDoNothing: ABCWindow[] = this.noCastWindows.history.filter(window => this.determineDoingNothing(window) !== null)
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
							return <Table.Row key={doingNothingWindow.leadingGCDTime}>
								<Table.Cell>
									<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(doingNothingWindow.leadingGCDTime - this.parser.pull.timestamp, (doingNothingWindow.trailingGCDTime ?? doingNothingWindow.leadingGCDTime) - this.parser.pull.timestamp)}
									/><br/>
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(doingNothingWindow.leadingGCDTime)}</span>
									- <span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(doingNothingWindow.trailingGCDTime ?? doingNothingWindow.leadingGCDTime)}</span>
									<br/>
									({this.parser.formatDuration((doingNothingWindow.trailingGCDTime ?? doingNothingWindow.leadingGCDTime) - doingNothingWindow.leadingGCDTime)} / {this.parser.formatDuration(doingNothingWindow.expectedGCDDuration)})
								</Table.Cell>
								<Table.Cell>
									{doingNothingTimeFormatted}
								</Table.Cell>
								<Table.Cell>
									{<div className={styles.container}>{doingNothingWindow.leadingGCDIcon}</div>}
									<Rotation events={[
										...(doingNothingWindow.leadingGCDEvent !== undefined ? [doingNothingWindow.leadingGCDEvent] : []), // don't want to show null action if individual weaves a lot in the beginning without any beginning actions
										...doingNothingWindow.actions,
										...(doingNothingWindow.trailingGCDEvent !== undefined ? [doingNothingWindow.trailingGCDEvent] : []), // don't want to show null action if individual weaves a lot close to the end without any ending actions
									]}/>
									{<div className={styles.container}>{doingNothingWindow.trailingGCDIcon}</div>}
								</Table.Cell>
							</Table.Row>
						})}
					</Table.Body>
				</Table>
				<Message info>
					{this.footer}
				</Message>
			</>

		// return for rendering
		const ABCTablePlaceHolder = {
			weaves: weaveTable,
			interrupts: interruptTable,
			deaths: deathTable,
			doNothing: doNothingTable,
		}

		// Rendering is in a specialised component so it's got some state to work with
		return <ABCTableExport abctables={ABCTablePlaceHolder}/>
	}
}
