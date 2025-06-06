import {Trans} from '@lingui/macro'
import {ActionRow, ActionTimeline as CoreActionTimeline} from 'parser/core/modules/ActionTimeline'

export class ActionTimeline extends CoreActionTimeline {
	static override rows: ActionRow[] = [
		...CoreActionTimeline.rows,

		// Addersgall actions
		{
			label: <Trans id="sge.actiontimeline.addersgall">Addersgall</Trans>,
			content: ['DRUOCHOLE', 'IXOCHOLE', 'TAUROCHOLE', 'KERACHOLE'],
		},
		'RHIZOMATA',
		// Eukrasia and related
		'EUKRASIA',
		'EUKRASIAN_DIAGNOSIS',
		'EUKRASIAN_PROGNOSIS',
		['EUKRASIAN_DOSIS_III', 'EUKRASIAN_DOSIS_II', 'EUKRASIAN_DOSIS'],
		// DPS 'cooldowns'
		'PSYCHE',
		'PNEUMA',
		['PHLEGMA_III', 'PHLEGMA_II', 'PHLEGMA'],
		// Cooldowns
		'PHILOSOPHIA',
		'HOLOS',
		'PANHAIMA',
		'HAIMA',
		['PHYSIS_II', 'PHYSIS'],
		'ZOE',
		'KRASIS',
		// Kardia
		'KARDIA',
		'SOTERIA',
	]
}
