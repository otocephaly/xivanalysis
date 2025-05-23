import {t, Trans} from '@lingui/macro'
import {Plural} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Procs} from 'parser/core/modules/Procs'
import {DISPLAY_ORDER} from 'parser/jobs/rdm/modules/DISPLAY_ORDER'

// Test log: unused MagickedSwordplay stacks - https://www.fflogs.com/reports/y9bc6qpf4KgVnvTX

export class MagickedSwordplay extends Procs {
	static override displayOrder = DISPLAY_ORDER.MAGICKED_SWORDPLAY
	static override handle = 'MagickedSwordplay'
	static override title = t('rdm.ms.title')`Magicked Swordplay Windows`

	override trackedProcs = [
		{
			procStatus: this.data.statuses.MAGICKED_SWORDPLAY,
			consumeActions: [
				this.data.actions.ENCHANTED_RIPOSTE,
				this.data.actions.ENCHANTED_ZWERCHHAU,
				this.data.actions.ENCHANTED_REDOUBLEMENT,
				this.data.actions.ENCHANTED_MOULINET,
				this.data.actions.ENCHANTED_MOULINET_DEUX,
				this.data.actions.ENCHANTED_MOULINET_TROIS,
			],
		},
	]

	override showDroppedProcSuggestion = true
	override droppedProcIcon = this.data.actions.ENCHANTED_ZWERCHHAU.icon
	override droppedProcContent = <Trans id="rdm.magickedswordplay.suggestions.missed.content">
		Try to use all three stacks of <DataLink status="MAGICKED_SWORDPLAY" /> by using a full enchanted sword combo whenever you use <DataLink action="MANAFICATION" />
	</Trans>
	override overrideDroppedProcsWhy() {
		this.droppedProcWhy = <Trans id="rdm.magickedswordplay.suggestions.dropped.why">You dropped <Plural value={this.droppedProcs} one="# stack" other="# stacks" /> of <DataLink status="MAGICKED_SWORDPLAY" showIcon={false} showTooltip={false} />.</Trans>
	}

	override showInvulnProcSuggestion = true
}
