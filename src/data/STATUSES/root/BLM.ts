import {iconUrl} from 'data/icon'
import {ensureStatuses} from '../type'

export const BLM = ensureStatuses({
	THUNDER_III: {
		id: 163,
		name: 'Thunder III',
		icon: iconUrl(210459),
		duration: 27000,
	},
	THUNDER_IV: {
		id: 1210,
		name: 'Thunder IV',
		icon: iconUrl(212657),
		duration: 21000,
	},
	HIGH_THUNDER: {
		id: 3871,
		name: 'High Thunder',
		icon: iconUrl(212661),
		duration: 30000,
	},
	HIGH_THUNDER_II: {
		id: 3872,
		name: 'High Thunder II',
		icon: iconUrl(212662),
		duration: 24000,
	},
	TRIPLECAST: {
		id: 1211,
		name: 'Triplecast',
		icon: iconUrl(212658),
	},
	FIRESTARTER: {
		id: 165,
		name: 'Firestarter',
		icon: iconUrl(210460),
		duration: 30000,
	},
	THUNDERHEAD: {
		id: 3870,
		name: 'Thunderhead',
		icon: iconUrl(212660),
		duration: 30000,
	},
	LEY_LINES: {
		id: 737,
		name: 'Ley Lines',
		icon: iconUrl(212653),
		duration: 30000,
	},
	CIRCLE_OF_POWER: {
		id: 738,
		name: 'Circle Of Power',
		icon: iconUrl(212654),
		speedModifier: 0.85,
	},
	MANAWARD: {
		id: 168,
		name: 'Manaward',
		icon: iconUrl(210456),
		duration: 20000,
	},
})
