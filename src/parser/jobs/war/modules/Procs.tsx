import {Plural, Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Procs as CoreProcs} from 'parser/core/modules/Procs'
import {TieredSuggestion, SEVERITY} from 'parser/core/modules/Suggestions'

const SEVERITY_MISSED_PROCS = {
	1: SEVERITY.MAJOR,
}

export class Procs extends CoreProcs {

	override trackedProcs = [
		{
			procStatus: this.data.statuses.INNER_RELEASE,
			consumeActions: [this.data.actions.FELL_CLEAVE, this.data.actions.DECIMATE],
		},
		{
			procStatus: this.data.statuses.PRIMAL_REND_READY,
			consumeActions: [this.data.actions.PRIMAL_REND],
		},
		{
			procStatus: this.data.statuses.PRIMAL_RUINATION_READY,
			consumeActions: [this.data.actions.PRIMAL_RUINATION],
		},
		{
			procStatus: this.data.statuses.WRATHFUL,
			consumeActions: [this.data.actions.PRIMAL_WRATH],
		},
	]

	protected override addJobSpecificSuggestions() {
		const missedInnerRelease = this.getDropCountForStatus(this.data.statuses.INNER_RELEASE.id)
		const missedRend = this.getDropCountForStatus(this.data.statuses.PRIMAL_REND_READY.id)
		const missedRuination = this.getDropCountForStatus(this.data.statuses.PRIMAL_RUINATION_READY.id)
		const missedWrath = this.getDropCountForStatus(this.data.statuses.WRATHFUL.id)

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.INNER_RELEASE.icon,
			content: <Trans id="war.procs.suggestions.dropped-inner-release.content">
				Using <DataLink action="INNER_RELEASE"/> grants 3 free uses of <DataLink action="FELL_CLEAVE"/> (or <DataLink action="DECIMATE"/> for 3 or more targets).
				Letting these expire is a damage loss and prevents you being able to use Primal Wrath, so make sure to consume them all before they expire.
			</Trans>,
			tiers: SEVERITY_MISSED_PROCS,
			value: missedInnerRelease,
			why: <Trans id="war.procs.suggestions.dropped-inner-release.why">
				<Plural value={missedInnerRelease} one="# stack" other="# stacks" /> of Inner Release expired without being used.
			</Trans>,
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.PRIMAL_REND.icon,
			content: <Trans id="war.procs.suggestions.dropped-primal-rend.content">
				Using <DataLink action="INNER_RELEASE" /> grants <DataLink status="PRIMAL_REND_READY" />. Use it for a strong attack and to unlock the even stronger <DataLink action="PRIMAL_RUINATION" />.
			</Trans>,
			tiers: SEVERITY_MISSED_PROCS,
			value: missedRend,
			why: <Trans id="war.procs.suggestions.dropped-primal-rend.why">
				You missed <Plural value={missedRend} one="# use" other="# uses" /> of Primal Rend.
			</Trans>,
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.PRIMAL_RUINATION.icon,
			content: <Trans id="war.procs.suggestions.dropped-primal-ruination.content">
				Using <DataLink action="PRIMAL_REND" /> grants you <DataLink status="PRIMAL_RUINATION_READY" /> for 20 seconds which lets you use <DataLink action="PRIMAL_RUINATION" />. It's your strongest GCD, so make sure to spend it before it expires.
			</Trans>,
			tiers: SEVERITY_MISSED_PROCS,
			value: missedRuination,
			why: <Trans id="war.procs.suggestions.dropped-primal-ruination.why">
			You missed <Plural value={missedRuination} one="# use" other="# uses" /> of Primal Ruination.
			</Trans>,
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.PRIMAL_WRATH.icon,
			content: <Trans id="war.procs.suggestions.dropped-primal-wrath.content">
				Using <DataLink action="FELL_CLEAVE" /> 3 times under <DataLink status="INNER_RELEASE" /> lets you use <DataLink action="PRIMAL_WRATH" />. Make sure to spend it before it expires.
			</Trans>,
			tiers: SEVERITY_MISSED_PROCS,
			value: missedWrath,
			why: <Trans id="war.procs.suggestions.dropped-primal-wrath.why">
			You missed <Plural value={missedWrath} one="# use" other="# uses" /> of Primal Wrath.
			</Trans>,
		}))
	}

}
