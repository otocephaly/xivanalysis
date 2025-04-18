import {DataLink} from 'components/ui/DbLink'
import {CONTRIBUTORS} from 'data/CONTRIBUTORS'

export const changelog = [
	// {
	// 	date: new Date('2021-11-19'),
	// 	Changes: () => <>The changes you made</>,
	// 	contributors: [CONTRIBUTORS.YOU],
	// },
	{
		date: new Date('2025-03-31'),
		Changes: () => <>Initial patch 7.2 changes:<br/><ul>
			<li>Cast time and status duration updates</li>
			<li>Adjusted AoE checks for revised potencies</li>
			<li>Ported Thunder DoT tracking to the core module</li>
			<li>Updated Gauge state handling due to removal of the AF/UI timer</li>
			<li>Fixed Firestarter usage analysis to stop flagging AF1 PD F3P as an AF3 extension</li></ul></>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-12-02'),
		Changes: () => <>Fixed a gauge tracking bug that caused Umbral Hearts to be consumed by <DataLink status="FIRESTARTER" /> procs.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-11-16'),
		Changes: () => <>Add a table displaying timestamps when procs were dropped, for better clarity around when those issues occurred.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-10-10'),
		Changes: () => <>Make sure the <DataLink action="PARADOX" /> gauge marker is reset on death, and Polyglot count is not reset when Enochian is dropped.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-11-12'),
		Changes: () => <>Handle 7.1 patch changes to cast times for <DataLink action="DESPAIR" /> and <DataLink action="FLARE" />, and the second charge for <DataLink action="LEY_LINES" />.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-31'),
		Changes: () => <>Revive support for Umbral Ice <DataLink action="PARADOX" />, and handle the new timer pause functionality from <DataLink action="UMBRAL_SOUL" />.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-24'),
		Changes: () => <>Remove overlooked defunct evaluator for skipping <DataLink action="BLIZZARD_IV" /> before a downtime.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-22'),
		Changes: () => <>Fix some text in the Gauge errors output header to specify the correct maximum number of Polyglot charges.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-19'),
		Changes: () => <>Update suggestion to avoid using <DataLink action="FIRE_I" />, add evaluation for the usage of <DataLink status="FIRESTARTER" />, and mark as supported for Dawntrail.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-13'),
		Changes: () => <>Update the suggestion for skipping <DataLink action="HIGH_THUNDER" /> before a downtime since it can no longer be hardcast.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-13'),
		Changes: () => <>Update expected fire spell counting to account for Dawntrail's rotation changes, and add a suggestion to use all <DataLink action="FLARE_STAR" />s generated.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-11'),
		Changes: () => <>Initial Rotation Outliers updates to remove defunct errors, and handle <DataLink action="MANAFONT" />'s full reset behavior</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-10'),
		Changes: () => <>Update DoT and proc tracking for Dawntrail thunder system</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-09'),
		Changes: () => <>Update AoE usage tracking for new spells and potencies</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-07-07'),
		Changes: () => <>Updated gauge state tracking for Dawntrail</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-06-27'),
		Changes: () => <>Add new actions and statuses, remove deleted actions and statuses, and some minimal cleanup to keep modules compiling</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
]
