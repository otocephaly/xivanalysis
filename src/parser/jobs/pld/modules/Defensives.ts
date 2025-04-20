import {Defensives as CoreDefensives} from 'parser/core/modules/Defensives'

export class Defensives extends CoreDefensives {
	protected override trackedActions = [
		this.data.actions.HALLOWED_GROUND,
		this.data.actions.GUARDIAN,
		this.data.actions.PASSAGE_OF_ARMS,
		this.data.actions.DIVINE_VEIL,
		this.data.actions.BULWARK,
	]
}
