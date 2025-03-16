import {ActionKey} from 'data/ACTIONS'
import {Events} from 'event'
import {dependency} from 'parser/core/Injectable'
import {AlwaysBeCasting as CoreAlwaysBeCasting, OGCD_OFFSET} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'
import {FIRE_SPELLS, ICE_SPELLS} from './Elements'
import {Gauge, ASTRAL_UMBRAL_MAX_STACKS} from './Gauge'

const OGCD_EXCEPTIONS: ActionKey[] = [
	'LUCID_DREAMING',
	'ADDLE',
	'SURECAST',
	'TRANSPOSE',
]

const OPENER_TIME_THRESHOLD = 10000
const OPENER_EXCEPTIONS: ActionKey[] = [
	'TRIPLECAST',
]

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	private ogcdIds = OGCD_EXCEPTIONS.map(key => this.data.actions[key].id)
	private openerIds = OPENER_EXCEPTIONS.map(key => this.data.actions[key].id)

	@dependency private gauge!: Gauge

	private iceSpellIds = ICE_SPELLS.map(key => this.data.actions[key].id)
	private fireSpellIds = FIRE_SPELLS.map(key => this.data.actions[key].id)

	protected override onCast(event: Events['action']) {
		const tracker = this.noCastWindows.current
		//gauge check
		const gaugeState = this.gauge.getGaugeState(event.timestamp)
		//allowed to clip only if it hits one of these conditions. assumption is that the full OGCD amount is allocated to the clip
		const condition = this.ogcdIds.includes(event.action)
			|| (this.openerIds.includes(event.action) && (event.timestamp - this.parser.pull.timestamp) < OPENER_TIME_THRESHOLD)
			|| (tracker?.startAction !== undefined && this.iceSpellIds.includes(tracker.startAction.action) && gaugeState.astralFire === ASTRAL_UMBRAL_MAX_STACKS)
			|| (tracker?.startAction !== undefined && this.fireSpellIds.includes(tracker.startAction.action) && gaugeState.umbralIce === ASTRAL_UMBRAL_MAX_STACKS)
		if (tracker !== undefined && condition) {
			tracker.gcdTime += OGCD_OFFSET
		}

		super.onCast(event)
	}
}
