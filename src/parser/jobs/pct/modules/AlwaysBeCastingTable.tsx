import {ABCTable as CoreABCTable} from 'parser/core/modules/AlwaysBeCastingTable'

export default class ABCTable extends CoreABCTable {
	// Star Prism's cure isn't a real action, it can't hurt you
	override ignoredActionIds = [this.data.actions.STAR_PRISM_CURE.id]
}
