import {DataLink} from 'components/ui/DbLink'
import {CONTRIBUTORS} from 'data/CONTRIBUTORS'

export const changelog = [
	{
		date: new Date('2025-03-24'),
		Changes: () => <>Viper 7.2 Support added.</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2025-01-29'),
		Changes: () => <>Fix a data error that was causing phantom prepull uses of <DataLink action="VICEWINDER"/> and <DataLink action="VICEPIT"/> follow-up GCDs to be recorded.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-11-16'),
		Changes: () => <>Add a table displaying timestamps when procs were dropped or overwritten, for better clarity around when those issues occurred.</>,
		contributors: [CONTRIBUTORS.AKAIRYU],
	},
	{
		date: new Date('2024-11-14'),
		Changes: () => <>Mark Viper supported for 7.1</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-10-21'),
		Changes: () => <> Fixed Bug with <DataLink action="UNCOILED_FURY" /> not being tracked correctly in the checklist.</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-10-20'),
		Changes: () => <>Disabled feedback modules that were implmented for 7.05 Viper Changes</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-10-02'),
		Changes: () => <>Expand <DataLink action="SERPENTS_TAIL"/> checklist and add <DataLink action="VICEWINDER"/> and <DataLink action="VICEPIT"/> checklist.</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-09-29'),
		Changes: () => <>Add 2 minute burst window based off <DataLink action="SERPENTS_IRE" /> casts for party buff alignments.</>,
		contributors: [CONTRIBUTORS.RYAN],

	},
	{
		date: new Date('2024-07-27'),
		Changes: () => <>Add <DataLink action="REAWAKEN"/> buff window analysis.</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-07-18'),
		Changes: () => <>Add Tincture Module to Viper</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-07-12'),
		Changes: () => <>Fix gauge not being modified under the effect of "ready to awaken"</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
	{
		date: new Date('2024-07-12'),
		Changes: () => <>Add positional tracking for <DataLink action="SWIFTSKINS_COIL" /> and <DataLink action="HUNTERS_COIL" /></>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-11'),
		Changes: () => <>Organize the timeline into groupings for each <DataLink action="DREADWINDER" />, <DataLink action="UNCOILED_FURY" />, and <DataLink action="REAWAKEN" /> combo</>,
		contributors: [CONTRIBUTORS.HINT],
	},
	{
		date: new Date('2024-07-04'),
		Changes: () => <>Initial 7.0 Viper Support</>,
		contributors: [CONTRIBUTORS.RYAN],
	},
]
