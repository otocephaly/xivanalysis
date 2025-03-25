import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	// With the reduced animation lock, it's just stardiver that's the bad weave
	override actionsWithExtraAnimationLock = [
		{
			actionID: this.data.actions.STARDIVER.id,
			timeLocked: this.ogcdOffset * 2, // TODO add actual time. just put 2 * OGCD for now
		},
	]
}
