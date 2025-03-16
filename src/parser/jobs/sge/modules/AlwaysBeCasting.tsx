import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	// Pneuma's cure isn't a real action, it can't hurt you
	override ignoredActionIds = [this.data.actions.PNEUMA_HEAL.id]
}
