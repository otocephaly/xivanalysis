import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {dependency} from 'parser/core/Injectable'
import {Checklist, Requirement, Rule} from 'parser/core/modules/Checklist'
import {DoTs} from 'parser/core/modules/DoTs'
import {Suggestions, SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'

const SEVERITIES = {
	CLIPPING: {
		6000: SEVERITY.MINOR,
		9000: SEVERITY.MEDIUM,
		12000: SEVERITY.MAJOR,
	},
}

export class Combust extends DoTs {
	static override handle = 'combust'

	@dependency private checklist!: Checklist
	@dependency private suggestions!: Suggestions

	override trackedStatuses = [
		this.data.statuses.COMBUST_III.id,
	]

	override addChecklistRules() {
		this.checklist.add(new Rule({
			name: <Trans id="ast.dots.rule.name">Keep your DoT up</Trans>,
			description: <Trans id="ast.dots.rule.description">
				<DataLink action="COMBUST_III" /> makes up a good portion of your damage. Aim to keep this DoT up at all times. It also can be used to weave (<DataLink action="ASTRAL_DRAW" /> / <DataLink action="UMBRAL_DRAW" />) and manage cards, or maneuver around without dropping GCD uptime.
			</Trans>,
			requirements: [
				new Requirement({
					name: <Trans id="ast.dots.requirement.uptime.name"><DataLink action="COMBUST_III" /> uptime</Trans>,
					percent: this.getUptimePercent(this.data.statuses.COMBUST_III.id),
				}),
			],
			displayOrder: DISPLAY_ORDER.DOT_CHECKLIST,
		}))
	}

	override addClippingSuggestions() {
		const combustClipPerMinute = this.getClippingAmount(this.data.statuses.COMBUST_III.id)
		// Suggestion for DoT clipping
		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.COMBUST_III.icon,
			content: <Trans id="ast.dots.suggestion.clip.content">
					Avoid refreshing <DataLink action="COMBUST_III" /> significantly before it expires.
			</Trans>,
			why: <Trans id="ast.dots.suggestion.clip.why">
				An average of {this.parser.formatDuration(combustClipPerMinute, 1)} seconds of <DataLink status="COMBUST_III" /> clipped per minute due to early refreshes.
			</Trans>,
			tiers: SEVERITIES.CLIPPING,
			value: combustClipPerMinute,
		}))
	}
}
