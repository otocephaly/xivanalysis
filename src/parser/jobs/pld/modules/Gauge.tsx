import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {JOBS} from 'data/JOBS'
import {Event, Events} from 'event'
import {filter, oneOf} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {CounterGauge, Gauge as CoreGauge} from 'parser/core/modules/Gauge'
import {Suggestions, SEVERITY, Suggestion} from 'parser/core/modules/Suggestions'

type GaugeModifier = Partial<Record<Event['type'], number>>

export class Gauge extends CoreGauge {
	static override title = t('pld.gauge.title')`Oath Gauge Usage`

	@dependency private suggestions!: Suggestions

	private oathGauge = this.add(new CounterGauge({
		initialValue: 100,
		graph: {
			handle: 'oathgauge',
			label: <Trans id="pld.gauge.label">Oath Gauge</Trans>,
			color: JOBS.PALADIN.colour,
			forceCollapsed: true,
		},
	}))
	private oathModifiers = new Map<number, GaugeModifier>([
		[this.data.actions.ATTACK.id, {action: 5}],
		[this.data.actions.SHELTRON.id, {action: -50}],
		[this.data.actions.INTERVENTION.id, {action: -50}],
		[this.data.actions.COVER.id, {action: -50}],
		[this.data.actions.HOLY_SHELTRON.id, {action: -50}],
	])

	override initialise() {
		super.initialise()

		this.addEventHook(
			filter<Event>()
				.type('action')
				.source(this.parser.actor.id)
				.action(oneOf(Array.from(this.oathModifiers.keys()))),
			this.onOathModifying
		)
		this.addEventHook('complete', this.onComplete)
	}

	// HELPERS
	private onOathModifying(event: Events['action']) {
		const modifier = this.oathModifiers.get(event.action)

		if (modifier != null) {
			const amount = modifier[event.type] ?? 0
			this.oathGauge.modify(amount)
		}
	}

	private onComplete() {
		this.suggestions.add(new Suggestion({
			icon: this.data.actions.HOLY_SHELTRON.icon,
			content: <Trans id="pld.gauge.waste.suggestion.content">
					Using <DataLink action="HOLY_SHELTRON"/> on yourself or <DataLink action="INTERVENTION"/> on a tank partner in case you're off tanking could reduce incoming damage from abilities or auto-attacks.
			</Trans>,
			why: <Trans id="pld.gauge.waste.suggestion.why">
				A total of {this.oathGauge.overCap} gauge was lost due to exceeding the cap.
			</Trans>,
			severity: SEVERITY.MINOR,
		}))
	}
}
