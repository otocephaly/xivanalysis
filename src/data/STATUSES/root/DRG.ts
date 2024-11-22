import {iconUrl} from 'data/icon'
import {ensureStatuses} from '../type'
import {SHARED} from './SHARED'

export const DRG = ensureStatuses({
	BATTLE_LITANY: {
		id: 786,
		name: 'Battle Litany',
		icon: iconUrl(212578),
		duration: 20000,
	},

	POWER_SURGE: {
		id: 2720,
		name: 'Power Surge',
		icon: iconUrl(210303),
		duration: 30000,
	},

	LANCE_CHARGE: {
		id: 1864,
		name: 'Lance Charge',
		icon: iconUrl(210304),
		duration: 20000,
	},

	CHAOS_THRUST: {
		id: 118,
		name: 'Chaos Thrust',
		icon: iconUrl(210307),
		duration: 24000,
	},

	CHAOTIC_SPRING: {
		id: 2719,
		name: 'Chaotic Spring',
		icon: iconUrl(212586),
		duration: 24000,
	},

	DIVE_READY: {
		id: 1243,
		name: 'Dive Ready',
		icon: iconUrl(212583),
		duration: 15000,
	},

	DRAGONS_FLIGHT: {
		id: 3845,
		name: "Dragon's Flight",
		icon: iconUrl(212587),
		duration: 30000,
	},

	STARCROSS_READY: {
		id: 3846,
		name: 'Starcross Ready',
		icon: iconUrl(212588),
		duration: 20000,
	},

	LIFE_SURGE: {
		id: 116,
		name: 'Life Surge',
		icon: iconUrl(210302),
		duration: 5000,
	},

	DRACONIAN_FIRE: {
		id: 1863,
		name: 'Draconian Fire',
		icon: iconUrl(212585),
		duration: 30000,
	},

	NASTROND_READY: {
		id: 3844,
		name: 'Nastrond Ready',
		icon: iconUrl(218151),
		duration: 20000,
	},

	ENHANCED_PIERCING_TALON: SHARED.UNKNOWN,
})
