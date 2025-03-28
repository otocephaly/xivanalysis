import {iconUrl} from 'data/icon'
import {Layer} from 'data/layer'
import {StatusRoot} from '../root'

export const patch710: Layer<StatusRoot> = {
	patch: '7.1',
	data: {
		ENHANCED_PIERCING_TALON: {
			id: 1870,
			name: 'Enhanced Piercing Talon',
			icon: iconUrl(212590),
			duration: 15000,
		},
		CRIMSON_STRIKE_READY: {
			id: 4403,
			name: 'Crimson Strike Ready',
			icon: iconUrl(212752),
			duration: 30000,
		},
	},
}
