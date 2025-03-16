import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	// Star Prism's cure isn't a real action, it can't hurt you
	override ignoredActionIds = [this.data.actions.STAR_PRISM_CURE.id]
}
