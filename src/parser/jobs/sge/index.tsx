import {t} from '@lingui/macro'
import {TransMarkdown} from 'components/ui/TransMarkdown'
import {CONTRIBUTORS, ROLES} from 'data/CONTRIBUTORS'
import {Meta} from 'parser/core/Meta'
import {changelog} from './changelog'

const description = t('sge.about.description')`
This analyser aims to identify some of the low-hanging fruit that could be used to improve your SGE gameplay, as well as give a deeper insight into what happened during an encounter.

If you would like to learn more about SGE, check the guides over at [The Balance](https://thebalanceffxiv.com/), and have a chat in the #sge_questions channel.
`

export const SAGE = new Meta({
	modules: () => import('./modules' /* webpackChunkName: "jobs-sge" */),

	Description: () => <TransMarkdown source={description}/>,

	supportedPatches: {
		from: '7.0',
		to: '7.2',
	},

	contributors: [
		// {user: CONTRIBUTORS.YOU, role: ROLES.YOUR_ROLE},
		{user: CONTRIBUTORS.AKAIRYU, role: ROLES.DEVELOPER},
	],

	changelog,
})
