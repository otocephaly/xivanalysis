import {CooldownDowntime} from 'parser/core/modules/CooldownDowntime'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'

const FIRSTUSEOFFSET_IRE = 2500
const FIRSTUSEOFFSET_DREAD = 7500
// Time that vipers have deemed ok for a OGCD to be down
const DEFAULT_ALLOWED_DOWNTIME = 2180

export class OGCDDowntime extends CooldownDowntime {
	override defaultAllowedAverageDowntime = DEFAULT_ALLOWED_DOWNTIME
	displayOrder = DISPLAY_ORDER.COOLDOWNS
	override trackedCds = [
		{
			cooldowns: [
				this.data.actions.SERPENTS_IRE,
			],
			firstUseOffset: FIRSTUSEOFFSET_IRE,
		},
		...(this.parser.patch.after('7.01') ? [{
			cooldowns: [
				this.data.actions.VICEWINDER,
				this.data.actions.VICEPIT,
			],
			firstUseOffset: FIRSTUSEOFFSET_DREAD,
		}] : [{
			cooldowns: [
				this.data.actions.DREADWINDER,
				this.data.actions.PIT_OF_DREAD,
			],
			firstUseOffset: FIRSTUSEOFFSET_DREAD,
		}]),
	]
}
