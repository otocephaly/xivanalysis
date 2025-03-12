import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {observer} from 'mobx-react'
import {useCallback, useContext} from 'react'
import {Button, ButtonGroup, ButtonProps} from 'semantic-ui-react'
// Direct path import 'cus it'll be a dep loop otherwise
import {StoreContext} from 'store'
//end of store context

//used for ABC Table, placed here to remove risk of circular reference
export const ABC_FILTER_VALUES = {
	WEAVING: 'weaving',
	DEATH: 'death',
	INTERRUPT: 'interrupt',
	DO_NOTHING: 'do-nothing',
}

const ABC_BUTTON_VALUES = {
	WEAVING: <Trans id="core.always-be-casting-table.button.weaving">Weaving Issues</Trans>,
	DEATH: <><DataLink action={'RAISE'} showName={false} showTooltip={false} /></>,
	INTERRUPT: <Trans id="core.always-be-casting-table.button.interrupt">Interrupted</Trans>,
	DO_NOTHING: <Trans id="core.always-be-casting-table.button.donothing">Other GCD Issues</Trans>,
}

export interface ABCTableProps {
	abctables: {
		weaves: JSX.Element | null,
		interrupts: JSX.Element | null,
		deaths: JSX.Element | null,
		doNothing: JSX.Element | null,
	}
}

export const ABCTableExport = observer(function ABCTableExport({abctables}: ABCTableProps) {
	const {settingsStore} = useContext(StoreContext)

	const onSetFilterABCTableNothing = useCallback(
		(_, data: ButtonProps) =>
			settingsStore.setFilterABCTable(data.value),
		[settingsStore],
	)

	//used to reset to default on page reload
	/*const componentDidMount = useCallback(
		(_: ButtonProps) =>
			settingsStore.setFilterABCTable(null),
		[settingsStore],
	)*/

	const tableFilterValue = settingsStore.filterABCTable

	//since do_nothing is default, leave it in anyway, otherwise hide button
	const buttonDoNothing: JSX.Element | null =
	abctables.doNothing === null
		? null
		: <><Button value={ABC_FILTER_VALUES.DO_NOTHING} onClick={onSetFilterABCTableNothing}>{ABC_BUTTON_VALUES.DO_NOTHING}</Button></>
	const buttonWeaving: JSX.Element | null =
	abctables.weaves === null
		? null
		: <><Button data={ABC_FILTER_VALUES.WEAVING} onClick={onSetFilterABCTableNothing}>{ABC_BUTTON_VALUES.WEAVING}</Button></>
	const buttonInterrupts: JSX.Element | null =
	abctables.interrupts === null
		? null
		: <><Button data={ABC_FILTER_VALUES.INTERRUPT} onClick={onSetFilterABCTableNothing}>{ABC_BUTTON_VALUES.INTERRUPT}</Button></>
	const buttonDeaths: JSX.Element | null =
	abctables.deaths === null
		? null
		: <><Button data={ABC_FILTER_VALUES.DEATH} onClick={onSetFilterABCTableNothing}>{ABC_BUTTON_VALUES.DEATH}</Button></>

	let ABCTable: JSX.Element | null = <></>
	switch (tableFilterValue) {
	//default to first seen
	case null: {
		ABCTable = abctables.weaves
			?? abctables.interrupts
			?? abctables.deaths
			?? abctables.doNothing
			?? null
		break
	}
	case ABC_FILTER_VALUES.WEAVING: {
		ABCTable = abctables.weaves
		break
	}
	case ABC_FILTER_VALUES.INTERRUPT: {
		ABCTable = abctables.interrupts
		break
	}
	case ABC_FILTER_VALUES.DEATH: {
		ABCTable = abctables.deaths
		break
	}
	case ABC_FILTER_VALUES.DO_NOTHING: {
		ABCTable = abctables.doNothing
		break
	}
	}

	return <>
		<ButtonGroup>
			{buttonDoNothing}
			{buttonWeaving}
			{buttonInterrupts}
			{buttonDeaths}
		</ButtonGroup>
		<br/>
		{ABCTable}
	</>
})
