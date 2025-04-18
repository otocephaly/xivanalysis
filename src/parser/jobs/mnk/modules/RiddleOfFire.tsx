import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {ActionKey} from 'data/ACTIONS'
import {Event, Events} from 'event'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {BuffWindow, EvaluatedAction, ExpectedGcdCountEvaluator, LimitedActionsEvaluator, TrackedAction} from 'parser/core/modules/ActionWindow'
import {HistoryEntry} from 'parser/core/modules/ActionWindow/History'
import {Cooldowns} from 'parser/core/modules/Cooldowns'
import {Downtime} from 'parser/core/modules/Downtime'
import {GlobalCooldown} from 'parser/core/modules/GlobalCooldown'
import {SEVERITY} from 'parser/core/modules/Suggestions'
import {fillActionIds} from 'utilities/fillArrays'
import {BLITZ_ACTIONS} from './constants'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'
import {BlitzEvaluator} from './evaluators/BlitzEvaluator'
import {RiddleOfWindEvaluator} from './evaluators/RiddleOfWindEvaluator'
import {PerfectBalance} from './PerfectBalance'

const EXPECTED_GCDS = 11

const SEVERITIES = {
	TOTAL_GCDS: {
		10: SEVERITY.MINOR,
		9: SEVERITY.MEDIUM,
		6: SEVERITY.MAJOR,
	},
	BAD_GCDS: {
		1: SEVERITY.MEDIUM,
		2: SEVERITY.MAJOR,
	},
}

const IGNORED_ACTIONS: ActionKey[] = [
	'FEINT',
	'MANTRA',
	'THUNDERCLAP',
	'RIDDLE_OF_EARTH',
	'EARTHS_REPLY',
	'SECOND_WIND',
	'LEG_SWEEP',
	'BLOODBATH',
	'ARMS_LENGTH',
	'TRUE_NORTH',
	'SPRINT',
]

export class RiddleOfFire extends BuffWindow {
	static override handle = 'riddleoffire'
	static override title = t('mnk.rof.title')`Riddle of Fire`
	static override displayOrder = DISPLAY_ORDER.RIDDLE_OF_FIRE

	@dependency private cooldowns!: Cooldowns
	@dependency private downtime!: Downtime
	@dependency private globalCooldown!: GlobalCooldown
	@dependency private perfectBalance!: PerfectBalance

	private pbCasts: number[] = []
	private blitzActions = fillActionIds(BLITZ_ACTIONS, this.data)
	private riddleActions = fillActionIds(['RIDDLE_OF_WIND'], this.data)
	buffStatus = this.data.statuses.RIDDLE_OF_FIRE

	private allowActionsInDowntime = (window: HistoryEntry<EvaluatedAction[]>, trackedAction: TrackedAction) => {
		const actionsInDowntime = window.data.filter(action =>
			action.action.id === trackedAction.action.id && this.downtime.isDowntime(action.timestamp)
		)
		return trackedAction.expectedPerWindow + actionsInDowntime.length
	}

	override initialise() {
		super.initialise()

		this.addEventHook(
			filter<Event>()
				.source(this.parser.actor.id)
				.type('action')
				.action(this.data.actions.PERFECT_BALANCE.id),
			(e: Events['action']) => { this.pbCasts.push(e.timestamp) })

		const suggestionWindowName = <DataLink action="RIDDLE_OF_FIRE"/>

		this.ignoreActions(fillActionIds(IGNORED_ACTIONS, this.data))

		this.addEvaluator(new BlitzEvaluator({
			blitzActions: this.blitzActions,
			blitzIcon: this.data.actions.MASTERFUL_BLITZ.icon,
			maxCharges: this.data.actions.PERFECT_BALANCE.charges,
			perfectBalance: this.perfectBalance,
			cooldowns: this.cooldowns,
			pullEnd: this.parser.pull.timestamp + this.parser.pull.duration,
			pbAction: this.data.actions.PERFECT_BALANCE,
		}))

		this.addEvaluator(new RiddleOfWindEvaluator({
			riddleActions: this.riddleActions,
		}))

		this.addEvaluator(new ExpectedGcdCountEvaluator({
			expectedGcds: EXPECTED_GCDS,
			globalCooldown: this.globalCooldown,
			hasStacks: false,
			suggestionIcon: this.data.actions.RIDDLE_OF_FIRE.icon,
			severityTiers: SEVERITIES.TOTAL_GCDS,
			suggestionWindowName: suggestionWindowName,
			suggestionContent: <Trans id="mnk.rof.suggestions.gcd.content">
				Aim to hit {EXPECTED_GCDS} GCDs during each <DataLink action="RIDDLE_OF_FIRE"/> window.
			</Trans>,
			adjustCount: window => {
				// 6SS counts as 2 GCDs
				return -window.data.filter(value => value.action.id === this.data.actions.SIX_SIDED_STAR.id).length
			},
		}))

		this.addEvaluator(new LimitedActionsEvaluator({
			expectedActions: [
				{
					action: this.data.actions.STEELED_MEDITATION,
					expectedPerWindow: 0,
				},
				{
					action: this.data.actions.FORBIDDEN_MEDITATION,
					expectedPerWindow: 0,
				},
				{
					action: this.data.actions.ENLIGHTENED_MEDITATION,
					expectedPerWindow: 0,
				},
				{
					action: this.data.actions.FORM_SHIFT,
					expectedPerWindow: 0,
				},
			],
			suggestionIcon: this.data.actions.FORBIDDEN_MEDITATION.icon,
			suggestionContent: <Trans id="mnk.rof.suggestions.wasted.content">
				Avoid using <DataLink action="FORBIDDEN_MEDITATION"/> or <DataLink action="FORM_SHIFT"/> under <DataLink status="RIDDLE_OF_FIRE"/> as this is essentially wasting a GCD.
			</Trans>,
			suggestionWindowName: suggestionWindowName,
			severityTiers: SEVERITIES.BAD_GCDS,
			adjustCount: this.allowActionsInDowntime,
		}))
	}

	public get windows() {
		return this.mapHistoryActions()
	}
}
