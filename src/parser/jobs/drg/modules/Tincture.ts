import {ACTIONS} from 'data/ACTIONS'
import {Tincture as CoreTincture} from 'parser/core/modules/Tincture'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'

export class Tincture extends CoreTincture {
	buffAction = ACTIONS.INFUSION_STR // Just in case there is an issue coming up with the core module, copied from SAM.
	static override displayOrder = DISPLAY_ORDER.TINCTURES // Change order of display of modules.
}
