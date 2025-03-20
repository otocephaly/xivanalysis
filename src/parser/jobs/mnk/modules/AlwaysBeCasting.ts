import {ABCWindow, AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

// Due to Greased Lightning, Monk frequently hits GCD speeds that make double
// weaving without clipping really close to the wire, to the point implementation
// details such as server message delay can effect an effective GCD roll or not.
// Core weaving marks this breakpoint (with wiggle room) as 1-weave only, but monk
// realistically uses two weaves regardless in these situations, as the resultant
// clipping is insufficient to outweigh the damage benefit. We're hard overriding
// with a permitted double weave here to account for that case - the ABC module
// will report on any significant downtime stemming from this, or otherwise.
const SSS_MAX_WEAVES = 4

export class AlwaysBeCasting extends CoreAlwaysBeCasting {

	protected override additionalJitter: number = 100 // allows monk weaves to get in more smoothly for the ones around 2s

	protected override determineBadWeave(window: ABCWindow) {
		let checkIfBadMNK = super.determineBadWeave(window)
		if (window.leadingGCDEvent !== undefined && window.leadingGCDEvent.action === this.data.actions.SIX_SIDED_STAR.id) {
			checkIfBadMNK = window.actions.length > SSS_MAX_WEAVES
		}
		return checkIfBadMNK
	}
}
