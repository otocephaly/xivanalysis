import {Trans} from '@lingui/react'
import {CONTRIBUTORS, ROLES} from 'data/CONTRIBUTORS'
import {Meta} from 'parser/core/Meta'
import {changelog} from './changelog'

export const WARRIOR = new Meta({
	modules: () => import('./modules' /* webpackChunkName: "jobs-war" */),

	Description: () => <>
		<Trans id="war.about.description">
			<p>This analyser aims to identify some of the low-hanging fruit that could be used to improve your WAR gameplay,
					as well as give a deeper insight into what happened during an encounter.</p>
			<p>If you notice anything that looks particularly wrong, please visit our Discord server and report it in the #fb-warrior channel.</p>
		</Trans>
	</>,

	supportedPatches: {
		from: '7.0',
		to: '7.2',
	},

	contributors: [
		{user: CONTRIBUTORS.KWEREY, role: ROLES.DEVELOPER},
	],

	changelog,
})
