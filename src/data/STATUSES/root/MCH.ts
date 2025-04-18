import {iconUrl} from 'data/icon'
import {ensureStatuses} from '../type'

export const MCH = ensureStatuses({
	REASSEMBLED: {
		id: 851,
		name: 'Reassembled',
		icon: iconUrl(213001),
		duration: 5000,
	},

	OVERHEATED: {
		id: 2688,
		name: 'Overheated',
		icon: 'https://xivapi.com/i/018000/018385.png',
		duration: 10000,
	},

	WILDFIRE: {
		id: 861,
		name: 'Wildfire',
		icon: iconUrl(213011),
		duration: 10000,
	},

	WILDFIRE_SELF: {
		id: 1946,
		name: 'Wildfire',
		icon: iconUrl(213019),
		duration: 10000,
	},

	FLAMETHROWER: {
		id: 1205,
		name: 'Flamethrower',
		icon: iconUrl(213017),
		duration: 10000,
	},

	BIOBLASTER: {
		id: 1866,
		name: 'Bioblaster',
		icon: iconUrl(213020),
		duration: 15000,
	},

	TACTICIAN: {
		id: 1951,
		name: 'Tactician',
		icon: iconUrl(213021),
		duration: 15000,
	},

	HYPERCHARGED: {
		id: 3864,
		name: 'Hypercharged',
		icon: iconUrl(213022),
		duration: 30000,
	},

	EXCAVATOR_READY: {
		id: 3865,
		name: 'Excavator Ready',
		icon: iconUrl(213023),
		duration: 30000,
	},

	FULL_METAL_MACHINIST: {
		id: 3866,
		name: 'Full Metal Machinist',
		icon: iconUrl(213024),
		duration: 30000,
	},
})
