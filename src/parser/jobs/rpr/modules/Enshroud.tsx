import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {ActionLink} from 'components/ui/DbLink'
import {RotationTargetOutcome} from 'components/ui/RotationTable'
import {Action, ActionKey} from 'data/ACTIONS'
import {BuffWindow, ExpectedActionGroupsEvaluator, EvaluatedAction, NotesEvaluator, TrackedActionGroup} from 'parser/core/modules/ActionWindow'
import {HistoryEntry} from 'parser/core/modules/ActionWindow/History'
import {EndOfWindowHandlingMode} from 'parser/core/modules/ActionWindow/windows/BuffWindow'
import {Data} from 'parser/core/modules/Data'
import {SEVERITY} from 'parser/core/modules/Suggestions'
import {Icon} from 'semantic-ui-react'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'

const REAPINGS_PER_SHROUD = 4

const SEVERITIES = {
	1: SEVERITY.MINOR,
	3: SEVERITY.MEDIUM,
	5: SEVERITY.MAJOR,
}

const SHROUD_ACTIONS: ActionKey[] = [
	'CROSS_REAPING',
	'VOID_REAPING',
	'GRIM_REAPING',
	'LEMURES_SLICE',
	'LEMURES_SCYTHE',
	'SACRIFICIUM',
	'COMMUNIO',
]

class EnhancedReapingEvaluator extends NotesEvaluator {

	header = {
		header: <Trans id="rpr.enshroud.enhanced.header">Alternated Reapings</Trans>,
		accessor: 'enhanced',
	}

	private data: Data

	constructor(data: Data) {
		super()
		this.data = data
	}

	override generateNotes(window: HistoryEntry<EvaluatedAction[]>): JSX.Element {
		return this.didReapingsAlternate(window) ?
			<Icon name="checkmark" className="text-success"/> :
			<Icon name="remove" className="text-error"/>
	}

	private didReapingsAlternate(window: HistoryEntry<EvaluatedAction[]>): boolean {
		let lastReaping: Action | undefined = undefined

		for (const action of window.data) {
			if (action.action === this.data.actions.VOID_REAPING || action.action === this.data.actions.CROSS_REAPING) {
				if (lastReaping === action.action) { return false }
				lastReaping = action.action
			}
		}

		return true
	}
}

export class Enshroud extends BuffWindow {
	static override handle = 'enshroud'
	static override title = t('rpr.enshroud.title')`Enshroud`
	static override displayOrder = DISPLAY_ORDER.ENSHROUD

	override buffStatus = this.data.statuses.ENSHROUDED
	override endOfWindowHandlingMode: EndOfWindowHandlingMode = 'SAME-TIMESTAMP'

	override initialise() {
		super.initialise()

		this.trackOnlyActions(SHROUD_ACTIONS.map(a => this.data.actions[a].id))

		this.addEvaluator(new ExpectedActionGroupsEvaluator({
			expectedActionGroups: [
				{
					actions: [
						this.data.actions.CROSS_REAPING,
						this.data.actions.VOID_REAPING,
						this.data.actions.GRIM_REAPING,
					],
					expectedPerWindow: REAPINGS_PER_SHROUD,
				},
				{
					actions: [
						this.data.actions.LEMURES_SLICE,
						this.data.actions.LEMURES_SCYTHE,
					],
					expectedPerWindow: 2,
				},
				{
					actions: [
						this.data.actions.SACRIFICIUM,
					],
					expectedPerWindow: 1,
				},
				{
					actions: [
						this.data.actions.COMMUNIO,
					],
					expectedPerWindow: 1,
				},
			],
			suggestionIcon: this.data.actions.ENSHROUD.icon,
			suggestionContent: <Trans id="rpr.enshroud.suggestions.content">
				Each <ActionLink action="ENSHROUD"/> window should contain 2 uses each of <ActionLink action="CROSS_REAPING"/>, <ActionLink action="VOID_REAPING"/>,
				and <ActionLink action="LEMURES_SLICE"/> (or their AoE equivalents), and 1 use of <ActionLink action="SACRIFICIUM"/> and <ActionLink action="COMMUNIO"/>.
			</Trans>,
			suggestionWindowName: <ActionLink action="ENSHROUD" showIcon={false} />,
			severityTiers: SEVERITIES,
			adjustOutcome: this.adjustOutcome.bind(this),
		}))

		this.addEvaluator(new EnhancedReapingEvaluator(this.data))
	}

	private adjustOutcome(window: HistoryEntry<EvaluatedAction[]>, action: TrackedActionGroup) {
		if (action.actions[0] !== this.data.actions.CROSS_REAPING) { return undefined }

		return (actual: number, expected?: number) => {
			// Going over the expected count of reapings is bad since that means you will lose the Communio.
			return (actual === expected) ? RotationTargetOutcome.POSITIVE : RotationTargetOutcome.NEGATIVE
		}
	}

}
