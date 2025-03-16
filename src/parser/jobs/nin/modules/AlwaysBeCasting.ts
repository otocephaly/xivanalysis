import {Events} from 'event'
import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	protected dreams: number | undefined = undefined

	protected override onCast(event: Events['action']) {
		const tracker = this.noCastWindows
		//if dream within a dream is already within the same window (ignoring the case when the individual uses no GCDs between DWD CD), then ignore this cast so it's not added to anything
		if (tracker.current !== undefined
			&& event.action === this.data.actions.DREAM_WITHIN_A_DREAM.id
			&& tracker.current.actions.filter(action => action.action === this.data.actions.DREAM_WITHIN_A_DREAM.id)
		) { return }

		super.onCast(event)
	}
}
