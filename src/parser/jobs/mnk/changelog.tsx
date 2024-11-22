import {ActionLink} from 'components/ui/DbLink'
import CONTRIBUTORS from 'data/CONTRIBUTORS'
import React from 'react'

export const changelog = [
	{
		date: new Date('2024-11-12'),
		Changes: () => <>Mark Monk as supported for patch 7.1</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-29'),
		Changes: () => <>Mark Monk as supported for patch 7.01</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-29'),
		Changes: () => <>Add checklist items and suggestions for maximizing Opo-opo GCDs</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-26'),
		Changes: () => <>Fix incorrect icon on <ActionLink action="SHADOW_OF_THE_DESTROYER" /></>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-25'),
		Changes: () => <>Add Fury Gauge graph and suggestions for overcapped Fury</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-25'),
		Changes: () => <>Add Nadi tracking for <ActionLink action="ELIXIR_BURST" /> and pre-upgrade Blitz actions</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-25'),
		Changes: () => <>Add suggestions for dropped uses of <ActionLink action="FIRES_REPLY" /> and <ActionLink action="WINDS_REPLY" /></>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-04'),
		Changes: () => <>Initial data scaffolding for Dawntrail</>,
		contributors: [CONTRIBUTORS.HINT],
	},
]
