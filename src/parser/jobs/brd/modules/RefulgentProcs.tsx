import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Procs} from 'parser/core/modules/Procs'
import DISPLAY_ORDER from './DISPLAY_ORDER'

export class RefulgentProcs extends Procs {
	static override title = t('brd.procs.title')`Hawk's Eye Overwrites`
	static override displayOrder = DISPLAY_ORDER.REFULGENT_PROCS

	override trackedProcs = [
		{
			procStatus: this.data.statuses.HAWKS_EYE,
			consumeActions: [this.data.actions.REFULGENT_ARROW, this.data.actions.SHADOWBITE],
		},
	]

	override showProcIssueOutput = true
	// BRD was only showing overwrites before, so keep that behavior
	override showDroppedProcOutput = false
	override showInvulnProcOutput = false
	override procOutputHeader = <Trans id="brd.procs.refulgentproc.content">
		<DataLink status="HAWKS_EYE" /> may be generated by <DataLink action="BURST_SHOT" />, <DataLink action="IRON_JAWS" />,&nbsp;
		<DataLink action="CAUSTIC_BITE" />, and <DataLink action="STORMBITE" />.
	</Trans>

	override showDroppedProcSuggestion = true
	override droppedProcIcon = this.data.actions.REFULGENT_ARROW.icon
	override droppedProcContent = <Trans id="brd.procs.suggestions.missed.content">
		Try to use <DataLink action="REFULGENT_ARROW" /> whenever you have <DataLink status="HAWKS_EYE" />.
	</Trans>

	override showOverwroteProcSuggestion = true
	override overwroteProcIcon = this.data.actions.REFULGENT_ARROW.icon
	override overwroteProcContent = <Trans id="brd.procs.suggestions.overwritten.content">
		Avoid using actions that grant <DataLink status="HAWKS_EYE" /> when you
		could use <DataLink action="REFULGENT_ARROW" /> instead.
	</Trans>
}
