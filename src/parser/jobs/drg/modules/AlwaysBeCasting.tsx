import {AlwaysBeCasting as CoreAlwaysBeCasting, OGCD_OFFSET} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	// With the reduced animation lock, it's just stardiver that's the bad weave
	override actionsWithExtraAnimationLock = [
		{
			actionID: this.data.actions.STARDIVER.id,
			timeLocked: OGCD_OFFSET * 2, // TODO add actual time. just put 2 * OGCD for now
		},
	]
}
