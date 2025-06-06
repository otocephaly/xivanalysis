import {t} from '@lingui/macro'
import {Trans, Plural} from '@lingui/react'
import {ActionLink, DataLink} from 'components/ui/DbLink'
import {Rotation} from 'components/ui/Rotation'
import {Action} from 'data/ACTIONS/type'
import {Status} from 'data/STATUSES/type'
import {Event, Events} from 'event'
import {Analyser} from 'parser/core/Analyser'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {History} from 'parser/core/modules/ActionWindow/History'
import {Actors} from 'parser/core/modules/Actors'
import {Data} from 'parser/core/modules/Data'
import {Suggestions, TieredSuggestion, SEVERITY} from 'parser/core/modules/Suggestions'
import {Timeline} from 'parser/core/modules/Timeline'
import {DISPLAY_ORDER} from 'parser/jobs/rdm/modules/DISPLAY_ORDER'
import {ManaGauge, MANA_DIFFERENCE_THRESHOLD, MANA_CAP} from 'parser/jobs/rdm/modules/ManaGauge'
import {Fragment} from 'react'
import {Button, Message, Table} from 'semantic-ui-react'

type MeleeCombo = {
	events: Array<Events['action']>,
	lastAction: Events['action'],
	finisher: {
		used: number,
		recommendedActions: Action[],
		recommendation: JSX.Element
	},
	procs: Status[]
	broken: boolean,
	startingMana: {
		white: number,
		black: number
	}
}

interface ManaActions {
	proc: Action,
	dualcast: Action,
	finisher: Action,
}

interface ManaState {
	amount: number,
	procReady: boolean,
	actions: ManaActions,
}

enum SuggestionKey {
	WRONG_FINISHER = 'WRONG_FINISHER',
	DELAY_COMBO = 'DELAY_COMBO',
}

export class MeleeCombos extends Analyser {
	static override handle = 'mlc'
	static override title = t('rdm.meleecombos.title')`Melee Combos`
	static override displayOrder = DISPLAY_ORDER.MELEE_COMBO
	static override debug = false

	@dependency private data!: Data
	@dependency private suggestions!: Suggestions
	@dependency private timeline!: Timeline
	@dependency private actors!: Actors
	@dependency private manaGauge!: ManaGauge

	private readonly finishers = [
		this.data.actions.VERHOLY.id,
		this.data.actions.VERFLARE.id,
	]
	private readonly severityWastedFinisher = {
		1: SEVERITY.MINOR,
		2: SEVERITY.MEDIUM,
		3: SEVERITY.MAJOR,
	}
	private readonly whiteManaActions: ManaActions = {
		proc: this.data.actions.VERSTONE,
		dualcast: this.data.actions.VERAERO_III,
		finisher: this.data.actions.VERHOLY,
	}
	private readonly blackManaActions: ManaActions = {
		proc: this.data.actions.VERFIRE,
		dualcast: this.data.actions.VERTHUNDER_III,
		finisher: this.data.actions.VERFLARE,
	}
	private readonly ignoreFinisherProcsManaThreshold = 4
	private readonly upperComboTimeFrame = 13
	private readonly openerDelayForgivenessDuration = 15000

	private readonly suggestionText: Record<SuggestionKey, JSX.Element> = {
		[SuggestionKey.WRONG_FINISHER]: <Trans id="rdm.meleecombos.recommendation.wrongfinisher">
			You should use <DataLink action="VERFLARE"/> when your black mana is lower or <DataLink action="VERHOLY"/> when your white mana is lower.
		</Trans>,
		[SuggestionKey.DELAY_COMBO]: <Trans id="rdm.meleecombos.recommendation.delaycombo">
			Do not enter your combo with your finisher's proc up. Consider dumping a proc before entering the melee combo as long as you waste less than {this.ignoreFinisherProcsManaThreshold} mana to overcapping.
		</Trans>,
	}

	private meleeCombos = new History<MeleeCombo>(() => ({
		events: [],
		lastAction: {} as Events['action'],
		finisher: {
			used: 0,
			recommendedActions: [],
			recommendation: <Trans></Trans>,
		},
		procs: [],
		broken: false,
		startingMana: {
			white: 0,
			black: 0,
		}}))
	private incorrectFinishers = {
		verholy: 0,
		verflare: 0,
		delay: 0,
	}
	private footnoteIndexes: SuggestionKey[] = []

	override initialise() {
		super.initialise()

		this.addEventHook(
			filter<Event>()
				.type('action')
				.source(this.parser.actor.id),
			this.onCast)
		this.addEventHook(
			filter<Event>()
				.type('death')
				.actor(this.parser.actor.id),
			this.onDeath
		)
		this.addEventHook(
			filter<Event>()
				.type('complete'),
			this.onComplete
		)
	}

	private onCast(event: Events['action']) {
		const action = this.data.getAction(event.action)

		if (action == null) {
			return
		}

		const current = this.meleeCombos.getCurrent()

		if (action.combo) {
			//We still want to merge the regular and finisher combos, so lets not make a new row for the finisher
			if (action.combo.start && !this.finishers.includes(action.id)) {
				this.breakComboIfExists(event.timestamp)
				this.startCombo(event)
			} else {
				if (current == null) {
					return
				}

				//Again we need to check against the finishers list, we still want one merged row with finisher calculations
				if (action.combo.from || this.finishers.includes(action.id)) {
					const fromOptions = Array.isArray(action.combo.from) ? action.combo.from : [action.combo.from]
					//Make certain not to end the combo as broken if we're starting the finisher combo.
					if (!fromOptions.includes(current.data.lastAction.action ?? 0) && !this.finishers.includes(action.id)) {
						current.data.broken = true
						this.endCombo(event.timestamp)
					} else {
						current.data.events.push(event)
						current.data.lastAction = event
						if (this.finishers.includes(action.id)) {
							current.data.finisher.used = event.action
						}
						//Only handle finisher if this is Resolution, since if we're here we shouldn't be broken.
						if (action.combo.end && event.action === this.data.actions.RESOLUTION.id) {
							this.handleFinisher()
							this.endCombo(event.timestamp)
						}
					}
				}
			}
		}

		if (action.breaksCombo) {
			if (current) {
				this.debug(`Action ${action.name} Breaks Combo at ${this.parser.formatEpochTimestamp(event.timestamp, 1)}`)
			}
			/*
			Manafication does break combos, but the way we are currently modeling the full RDM combo isn't accurate anymore.
			A full fix for this entails modeling mana stacks, splitting the full combo into two, and fixing the UI to display that info in a reasonable way.
			However, as more people are starting to use Manafication after EncRedoublement (to fit multiple combos under buffs), this is a band-aid fix for now.
			Additional Note: Event though we've now modeled the underlying combos differently, to accurately handle finishers we fabricate them appearing similar to
			how they were when they were one large combo.  As such for now this fix is no longer a bandaid but a permanent fixture.
			*/
			if (action.id === this.data.actions.MANAFICATION.id &&
				//Since we now have an actual factual AE Combo, check for either the Single Target or AE Target final hit here.
				current && (current.data.lastAction.action === this.data.actions.ENCHANTED_REDOUBLEMENT.id || current.data.lastAction.action === this.data.actions.ENCHANTED_MOULINET_TROIS.id)) {
				return
			}
			this.breakComboIfExists(event.timestamp)
		}
	}

	private onDeath(event: Events['death']) {
		this.breakComboIfExists(event.timestamp)
	}

	private onComplete(event: Events['complete']) {
		// Finish any open combos
		this.breakComboIfExists(event.timestamp)

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.VERFLARE.icon,
			content: this.suggestionText.WRONG_FINISHER,
			why: <Plural id="rdm.meleecombos.recommendation.wrongfinisher.why" value={this.incorrectFinishers.verholy + this.incorrectFinishers.verflare} one="# Verfire/Verstone cast was lost due to using the incorrect finisher." other="# Verfire/Verstone casts were lost due to using the incorrect finisher." />,
			tiers: this.severityWastedFinisher,
			value: this.incorrectFinishers.verholy + this.incorrectFinishers.verflare,
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.VERSTONE.icon,
			content: this.suggestionText.DELAY_COMBO,
			why: <Plural id="rdm.meleecombos.recommendation.delaycombo.why" value={this.incorrectFinishers.delay} one="# Proc cast was lost due to entering the melee combo with the finisher proc up." other="# Proc casts were lost due to entering the melee combo with the finisher proc up." />,
			tiers: this.severityWastedFinisher,
			value: this.incorrectFinishers.delay,
		}))
	}

	// Helper needed to make this.timeline.show behave, remove when timeline is a Sith and deals in absolutes
	private relativeTimestamp(timestamp: number) {
		return timestamp - this.parser.pull.timestamp
	}

	//Helper to ensure we never attempt to navigate the timeline beyond the ending bound of the fight
	private endTimestampCap(timestamp: number) {
		const fightEnd = this.parser.pull.duration + this.parser.pull.timestamp
		if (timestamp > fightEnd) {
			return fightEnd
		}

		return timestamp

	}

	override output() {
		if (this.meleeCombos.entries.length === 0) { return undefined }

		return (<Fragment>
			<Table compact unstackable celled>
				<Table.Header>
					<Table.Row>
						<Table.HeaderCell collapsing>
							<strong><Trans id="rdm.meleecombos.table.header.time">Time</Trans></strong>
						</Table.HeaderCell>
						<Table.HeaderCell collapsing>
							<strong><Trans id="rdm.meleecombos.table.header.starting-mana">Starting Mana</Trans></strong>
						</Table.HeaderCell>
						<Table.HeaderCell collapsing>
							<strong><Trans id="rdm.meleecombos.table.header.starting-procs">Starting Procs</Trans></strong>
						</Table.HeaderCell>
						<Table.HeaderCell>
							<strong><Trans id="rdm.meleecombos.table.header.rotation">Rotation</Trans></strong>
						</Table.HeaderCell>
						<Table.HeaderCell>
							<strong><Trans id="rdm.meleecombos.table.header.recommended">Recommended</Trans></strong>
						</Table.HeaderCell>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{
						this.meleeCombos.entries.map(combo => {
							const white = combo.data.startingMana.white
							const black = combo.data.startingMana.black

							// Prevent null reference errors with broken combos - start with empty values and load with finisher data if exists
							const recommendedActions = (combo.data.finisher) ? combo.data.finisher.recommendedActions : []
							const recommendation = (combo.data.finisher) ? combo.data.finisher.recommendation : ''

							return (<Table.Row key={combo.start}>
								<Table.Cell textAlign="center">
									<span style={{marginRight: 5}}>{this.parser.formatEpochTimestamp(combo.start)}</span>
									{<Button
										circular
										compact
										size="mini"
										icon="time"
										onClick={() => this.timeline.show(this.relativeTimestamp(combo.start), this.relativeTimestamp(this.endTimestampCap(combo.end ?? combo.start + this.upperComboTimeFrame)))}
									/>}
								</Table.Cell>
								<Table.Cell>
									<span style={{whiteSpace: 'nowrap'}}>{white} White | {black} Black</span>
								</Table.Cell>
								<Table.Cell>
									<span>{
										combo.data.procs.map((key) => {
											switch (key) {
											case this.data.statuses.VERSTONE_READY:
												return (<DataLink key="verstone" showName={false} status="VERSTONE_READY"/>)
											case this.data.statuses.VERFIRE_READY:
												return (<DataLink key="verfire" showName={false} status="VERFIRE_READY"/>)
											}
										})
									}</span>
								</Table.Cell>
								<Table.Cell>
									<span style={{whiteSpace: 'nowrap'}}><Rotation events={combo.data.events} /></span>
								</Table.Cell>
								<Table.Cell>
									{
										recommendedActions.map((action) => {
											return (<ActionLink key={action.id} showName={false} {...action}/>)
										})
									}
									{
										recommendedActions.length > 0 && <br />
									}
									{recommendation}
								</Table.Cell>
							</Table.Row>)
						})
					}
				</Table.Body>
			</Table>
			{this.footnoteIndexes.length > 0 && <Message>
				{
					this.footnoteIndexes.map((key, index) => {
						return (<Fragment key={key}>
							<sup>{index + 1}</sup> {this.suggestionText[key]}
							{index < this.footnoteIndexes.length - 1 && <br />}
						</Fragment>)
					})
				}
			</Message>}
		</Fragment>)
	}

	private startCombo(event: Events['action']) {
		const current = this.meleeCombos.openNew(event.timestamp)
		current.data.events.push(event)
		current.data.lastAction = event
		if (this.actors.current.at(event.timestamp).hasStatus(this.data.statuses.VERSTONE_READY.id)) {
			current.data.procs.push(this.data.statuses.VERSTONE_READY)
		}
		if (this.actors.current.at(event.timestamp).hasStatus(this.data.statuses.VERFIRE_READY.id)) {
			current.data.procs.push(this.data.statuses.VERFIRE_READY)
		}
		current.data.startingMana.white = this.manaGauge.getWhiteManaAt(event.timestamp - 1)
		current.data.startingMana.black = this.manaGauge.getBlackManaAt(event.timestamp - 1)
	}

	private breakComboIfExists(timestamp: number) {
		const current = this.meleeCombos.getCurrent()
		if (current) {
			current.data.broken = true
			this.endCombo(timestamp)
		}
	}

	private endCombo(timestamp: number) {
		this.meleeCombos.closeCurrent(timestamp)
	}

	private handleFinisher() {
		const combo = this.meleeCombos.getCurrent()
		if (!combo) { return }

		const whiteState = {
			amount: combo.data.startingMana.white,
			procReady: combo.data.procs.includes(this.data.statuses.VERSTONE_READY),
			actions: this.whiteManaActions,
		} as ManaState
		const blackState = {
			amount: combo.data.startingMana.black,
			procReady: combo.data.procs.includes(this.data.statuses.VERFIRE_READY),
			actions: this.blackManaActions,
		} as ManaState
		const finisherAction = this.data.getAction(combo.data.finisher.used)
		if (finisherAction == null) {
			return
		}

		let recommendedFinisher = null
		if (whiteState.amount < blackState.amount) {
			recommendedFinisher = this.outOfBalanceFinisher(whiteState, blackState)
		} else if (blackState.amount < whiteState.amount) {
			recommendedFinisher = this.outOfBalanceFinisher(blackState, whiteState)
		} else {
			recommendedFinisher = this.inBalanceFinisher(blackState, whiteState)
		}

		if (recommendedFinisher instanceof Array) {
			if (recommendedFinisher === this.finishers) {
				// a recommendation of both finishers means ignore the finisher, either one is valid
				combo.data.finisher.recommendedActions.push(finisherAction)
			} else if (combo.start - this.parser.pull.timestamp < this.openerDelayForgivenessDuration) {
				combo.data.finisher.recommendation = <Fragment>
					<Trans id="rdm.meleecombos.recommendation.opener.short">It's okay to lose procs in the opener.</Trans>
				</Fragment>
			} else {
				//We've been requested at least for now to not recommend delays for combos, we're not certain if this goes away
				//entirely or not, as such I'm just commenting out the final push of the recommendation but leaving the logic in place for now
				//Instead we'll just push it as if the first check was correct, that the finisher used was the correct one to utilize.
				combo.data.finisher.recommendedActions.push(finisherAction)
				// a recommendation of an array of actions is to delay the combo
				// Array.prototype.push.apply(combo.data.finisher.recommendedActions, recommendedFinisher)
				// this.incorrectFinishers.delay++
				// combo.data.finisher.recommendation = <Fragment>
				// 	<Trans id="rdm.meleecombos.recommendation.delaycombo.short">Delay combo</Trans><sup>{this.assignOrGetFootnoteIndex(SuggestionKey.DELAY_COMBO)}</sup>
				// </Fragment>
			}
		} else {
			const finisherAction = recommendedFinisher
			if (finisherAction == null) {
				return
			}
			// A specific finisher was recommended
			combo.data.finisher.recommendedActions.push(finisherAction)
			if (combo.data.finisher.used !== recommendedFinisher.id) {
				// wrong finisher was used, add an incorrect finisher tally
				if (combo.data.finisher.used === this.data.actions.VERHOLY.id) {
					this.incorrectFinishers.verholy++
				}
				if (combo.data.finisher.used === this.data.actions.VERFLARE.id) {
					this.incorrectFinishers.verflare++
				}
				combo.data.finisher.recommendation = <Fragment>
					<Trans id="rdm.meleecombos.recommendation.wrongfinisher.short">Wrong finisher</Trans><sup>{this.assignOrGetFootnoteIndex(SuggestionKey.WRONG_FINISHER)}</sup>
				</Fragment>
			}
		}
	}

	private outOfBalanceFinisher(lowerManaState: ManaState, higherManaState: ManaState) {
		if (!lowerManaState.procReady) {
			// no proc of the lower mana spell, use that finisher
			return lowerManaState.actions.finisher
		}

		const comboDelayResults = this.manaLossToDelayCombo(lowerManaState, higherManaState)
		if (!higherManaState.procReady) {
			// no proc of the higher mana spell, check accleration and potential out of balance to make recommendation
			const finisherManaGain = (this.manaGauge.gaugeModifiers.get(higherManaState.actions.finisher.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(higherManaState.actions.finisher.id)?.black ?? 0)
			if (higherManaState.amount - lowerManaState.amount + finisherManaGain > MANA_DIFFERENCE_THRESHOLD) {
				// We will go out of balance if we use the finisher of the higher mana, check to see if delaying combo would have been better
				if (comboDelayResults !== null && comboDelayResults.manaLoss <= this.ignoreFinisherProcsManaThreshold) {
					// return null (delay combo) if below threshold
					return comboDelayResults.finisher
				}
				// Going out of balance is worse than overwriting the lowerManaProc - recommend using the lowerMana finisher to stay in balance
				return lowerManaState.actions.finisher
			}

			// Check to see if delaying combo would have been better
			if (comboDelayResults !== null && comboDelayResults.manaLoss <= this.ignoreFinisherProcsManaThreshold) {
				// return null (delay combo) if below threshold
				return comboDelayResults.finisher
			}
			// If delaying finisher isn't worthwhile, but we won't go out of balance by using the higherManaFinisher, fishing for a 20% proc is better than overwriting the existing proc
			return higherManaState.actions.finisher
		}

		// Both procs are up, check to see if delaying combo would have been better
		if (comboDelayResults !== null && comboDelayResults.manaLoss <= this.ignoreFinisherProcsManaThreshold) {
			// return null (delay combo) if below threshold
			return comboDelayResults.finisher
		}
		// return both finishers (finisher doesn't matter) if above the threshold where the mana loss from delaying outweighs benefit of forced proc
		return this.finishers
	}

	private inBalanceFinisher(firstManaState: ManaState, secondManaState: ManaState) {

		if (firstManaState.procReady && secondManaState.procReady) {
			// Both procs are up, check to see if delaying combo would have been better
			const comboDelayResults = this.manaLossToDelayCombo(firstManaState, secondManaState)
			// Safeguard against null return if no valid delays were found
			if (comboDelayResults !== null && comboDelayResults.manaLoss <= this.ignoreFinisherProcsManaThreshold) {
				// return null (delay combo) if below threshold
				return comboDelayResults.finisher
			}
		}

		// Delaying combo is not better, return finisher of proc that isn't available (fishing for 20% is better than overwriting a proc or delaying)
		if (!firstManaState.procReady && !secondManaState.procReady) {
			// Neither proc is up - return both finishers (finisher doesn't matter)
			return this.finishers
		}
		if (!firstManaState.procReady) {
			return firstManaState.actions.finisher
		}
		if (!secondManaState.procReady) {
			return secondManaState.actions.finisher
		}
		// Both procs are up and it's not worthwhile to delay combo, return both finishers (finisher doesn't matter)
		return this.finishers
	}

	private manaLossToDelayCombo(lowerManaState: ManaState, higherManaState: ManaState) {
		const possibleDelays = []

		if (lowerManaState.procReady) {
			/* Case: lowerManaProc is available, "clear" the proc by casting Lower Proc + Higher Dualcast
				This case is valid whether or not the higherManaProc exists
				Overwriting the higherManaProc with the 50% chance while dumping is no net loss of procs compared to not delaying */
			// Net benefit: +1 proc gained (lowerMana) for effective potency of +34.8 (8 Mana)
			let newLowerMana = lowerManaState.amount + (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.proc.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.proc.id)?.black ?? 0)
			let newHigherMana = higherManaState.amount + (this.manaGauge.gaugeModifiers.get(higherManaState.actions.dualcast.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(higherManaState.actions.dualcast.id)?.black ?? 0)

			// Determine how much mana would be wasted to cap with this delay, then adjust post-delay mana totals to cap before further comparisons
			const manaLoss = Math.max(newLowerMana - MANA_CAP, 0) + Math.max(newHigherMana - MANA_CAP, 0)
			newLowerMana = Math.min(newLowerMana, MANA_CAP)
			newHigherMana = Math.min(newHigherMana, MANA_CAP)

			if (newLowerMana < newHigherMana) {
				// The proc we just cleared is still the lower mana, valid clear option, push onto stack
				possibleDelays.push({
					finisher: [lowerManaState.actions.proc, higherManaState.actions.dualcast, lowerManaState.actions.finisher],
					manaLoss: manaLoss,
				})
			}

			if (!higherManaState.procReady) {
				/* Case: lowerManaProc is available and higherManaProc is not, attempt to "rebalance" mana by casting lowerManaProc + lowerManaDualcast
					This is an additional and separate case to just clearing and "wasting" the higherManaProc in the case of both procs being up
					and can result in less mana loss than the lowerProc -> higherDualcast dump of the above case (e.g. when starting at 80|100) */
				// Net benefit: +1 proc gained (higherMana) for effective potency of +34.8 (8 Mana)
				let newLowerMana = lowerManaState.amount +
					((this.manaGauge.gaugeModifiers.get(lowerManaState.actions.proc.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.proc.id)?.black ?? 0)) +
					((this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.black ?? 0))
				let newHigherMana = higherManaState.amount

				// Determine how much mana would be wasted to cap with this delay, then adjust post-delay mana totals to cap before further comparisons
				const manaLoss = Math.max(newLowerMana - MANA_CAP, 0) + Math.max(newHigherMana - MANA_CAP, 0)
				newLowerMana = Math.min(newLowerMana, MANA_CAP)
				newHigherMana = Math.min(newHigherMana, MANA_CAP)

				if (newHigherMana < newLowerMana) {
					// Mana rebalancing resulted in the original higherMana becoming the lower total (guaranteed proc), valid option, push onto stack
					possibleDelays.push({
						finisher: [lowerManaState.actions.proc, lowerManaState.actions.dualcast, higherManaState.actions.finisher],
						manaLoss: manaLoss,
					})
				} else {
					// Verify that using the finisher of higherMana won't put us out of balance at the end
					const finisherManaGain = (this.manaGauge.gaugeModifiers.get(higherManaState.actions.finisher.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(higherManaState.actions.finisher.id)?.black ?? 0)
					if (!((newHigherMana + finisherManaGain - newLowerMana) > MANA_DIFFERENCE_THRESHOLD)) {
						// This is a net gain - we can now fish for an additional proc of higherMana, push onto stack
						possibleDelays.push({
							finisher: [lowerManaState.actions.proc, lowerManaState.actions.dualcast, higherManaState.actions.finisher],
							manaLoss: manaLoss,
						})
					}
				}
			}
		} else {
			// These cases should only be hit if lowerMana == higherMana (we were in balance at start of combo), to test benefits of delaying combo to imbalance mana
			// If lowerManaProc isn't available and lowerMana < higherMana, recommendation will always be the lowerManaActions.finisher
			if (higherManaState.procReady) { // eslint-disable-line no-lonely-if
				let newLowerMana = lowerManaState.amount + ((this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.black ?? 0))
				let newHigherMana = higherManaState.amount + ((this.manaGauge.gaugeModifiers.get(higherManaState.actions.proc.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(higherManaState.actions.proc.id)?.black ?? 0))

				// Determine how much mana would be wasted to cap with this delay, then adjust post-delay mana totals to cap before further comparisons
				const manaLoss = Math.max(newLowerMana - MANA_CAP, 0) + Math.max(newHigherMana - MANA_CAP, 0)
				newLowerMana = Math.min(newLowerMana, MANA_CAP)
				newHigherMana = Math.min(newHigherMana, MANA_CAP)

				if (newHigherMana < newLowerMana) {
					// Mana rebalancing resulted in the original higherMana becoming the lower total (guaranteed proc), valid option, push onto stack
					possibleDelays.push({
						finisher: [higherManaState.actions.proc, lowerManaState.actions.dualcast, higherManaState.actions.finisher],
						manaLoss: manaLoss,
					})
				}
			} else {
				// Neither proc is up, check with using Jolt  + higherMana's dualcast spell to delay so that lowerMana will get guaranteed proc
				let newLowerMana = lowerManaState.amount + (this.manaGauge.gaugeModifiers.get(this.data.actions.JOLT_II.id)?.white ?? 0)
				let newHigherMana = higherManaState.amount + (this.manaGauge.gaugeModifiers.get(this.data.actions.JOLT_II.id)?.black ?? 0) + ((this.manaGauge.gaugeModifiers.get(higherManaState.actions.dualcast.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(higherManaState.actions.dualcast.id)?.black ?? 0))
				const firstDelaySkill = this.data.actions.JOLT_II

				// Determine how much mana would be wasted to cap with this delay, then adjust post-delay mana totals to cap before further comparisons
				const manaLoss = Math.max(newLowerMana - MANA_CAP, 0) + Math.max(newHigherMana - MANA_CAP, 0)
				newLowerMana = Math.min(newLowerMana, MANA_CAP)
				newHigherMana = Math.min(newHigherMana, MANA_CAP)
				if (newLowerMana < newHigherMana) {
					// Mana rebalancing resulted in the original higherMana becoming the lower total (guaranteed proc), valid option, push onto stack
					possibleDelays.push({
						finisher: [firstDelaySkill, lowerManaState.actions.dualcast, higherManaState.actions.finisher],
						manaLoss: manaLoss,
					})
				} else {
					// Check if using Jolt  + lowerMana's dualcast spell to delay so that higherMana will get guaranteed proc
					let newLowerMana = lowerManaState.amount + (this.manaGauge.gaugeModifiers.get(this.data.actions.JOLT_II.id)?.white ?? 0) + ((this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.white ?? 0) || (this.manaGauge.gaugeModifiers.get(lowerManaState.actions.dualcast.id)?.black ?? 0))
					let newHigherMana = higherManaState.amount + (this.manaGauge.gaugeModifiers.get(this.data.actions.JOLT_II.id)?.black ?? 0)
					const firstDelaySkill = this.data.actions.JOLT_II

					// Determine how much mana would be wasted to cap with this delay, then adjust post-delay mana totals to cap before further comparisons
					const manaLoss = Math.max(newLowerMana - MANA_CAP, 0) + Math.max(newHigherMana - MANA_CAP, 0)
					newLowerMana = Math.min(newLowerMana, MANA_CAP)
					newHigherMana = Math.min(newHigherMana, MANA_CAP)
					if (newHigherMana < newLowerMana) {
						// Mana rebalancing resulted in the original higherMana becoming the lower total (guaranteed proc), valid option, push onto stack
						possibleDelays.push({
							finisher: [firstDelaySkill, lowerManaState.actions.dualcast, higherManaState.actions.finisher],
							manaLoss: manaLoss,
						})
					}
				}
				// End cases for delaying combo to clear procs
			}
		}

		if (possibleDelays.length > 0) {
			// At least one valid case for delaying combo was found, return the most efficient (lowest manaLoss) for consideration
			possibleDelays.sort((a, b) => {
				if (a.manaLoss > b.manaLoss) {
					return 1
				}

				if (a.manaLoss < b.manaLoss) {
					return -1
				}

				return 0
			})

			return possibleDelays[0]
		}

		// No valid case for delaying combo was found
		return null
	}

	private assignOrGetFootnoteIndex(key: SuggestionKey) {
		if (!this.footnoteIndexes.includes(key)) {
			this.footnoteIndexes.push(key)
		}
		return this.footnoteIndexes.indexOf(key) + 1
	}
}
