import {Events} from 'event'
import {ABCWindow, AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

// Due to Greased Lightning, Monk frequently hits GCD speeds that make double
// weaving without clipping really close to the wire, to the point implementation
// details such as server message delay can effect an effective GCD roll or not.
// Core weaving marks this breakpoint (with wiggle room) as 1-weave only, but monk
// realistically uses two weaves regardless in these situations, as the resultant
// clipping is insufficient to outweigh the damage benefit. We're hard overriding
// with a permitted double weave here to account for that case - the ABC module
// will report on any significant downtime stemming from this, or otherwise.
const EXTRA_OGCD_ALLOWANCE: number = 100 // adds extra fluff in case within 100 ms of GCD
const MIN_WEAVES: number = 2
const MIN_GCD_APPLICABLE: number = 2000 // in case MNK has an ability where GCD is above 2s

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	// forbidden chakra has extra animation lock
	override actionsWithExtraAnimationLock = [
		{
			actionID: this.data.actions.THE_FORBIDDEN_CHAKRA.id,
			timeLocked: this.ogcdOffset * 2, // TODO add actual time. just put 2 * OGCD for now
		},
	]

	override checkAndSave(endTime: number, event?: Events['action']): void {
		const tracker: ABCWindow | undefined = this.noCastWindows.current
		// if in a window, the GCD is below 2s and there are two or more weaves or if includes forbidden chakra, then we want to adjust since we assume the minor clipping is intentional
		if (tracker !== undefined
			&& ((tracker.expectedGCDDuration <= MIN_GCD_APPLICABLE
			&& tracker.actions.length >= MIN_WEAVES)
				|| tracker.actions.filter(action => action.action === this.data.actions.THE_FORBIDDEN_CHAKRA.id).length !== 0)
		) {
			tracker.expectedGCDDuration += EXTRA_OGCD_ALLOWANCE
		}
		super.checkAndSave(endTime, event)
	}
}
