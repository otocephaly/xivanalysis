import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {observer} from 'mobx-react'
import * as PropTypes from 'prop-types'
import React from 'react'
import {Button, ButtonGroup, ButtonProps} from 'semantic-ui-react'
// Direct path import 'cus it'll be a dep loop otherwise
import {StoreContext} from 'store'
import {SettingsStore} from 'store/settings'
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

@observer
class ABCTableFilter extends React.Component {
	static propTypes = {
		settingsStore: PropTypes.instanceOf(SettingsStore),
		ABCTables: PropTypes.shape({
			weaves: PropTypes.element,
			interrupts: PropTypes.element,
			deaths: PropTypes.element,
			doNothing: PropTypes.element,
		}).isRequired,
	}

	static override contextType = StoreContext

	onSetFilterABCTable = (_: React.MouseEvent<HTMLButtonElement, MouseEvent>, data: ButtonProps) => {
		const {settingsStore} = this.context
		settingsStore.setFilterABCTable(data.value)
	}

	//used to reset to default on page reload
	override componentDidMount(): void {
		const {settingsStore} = this.context
		settingsStore.setFilterABCTable(null)
	}

	override render() {
		const tableFilterValue = this.context.settingsStore.filterABCTable
		const propsABCTables = this.props.ABCTables

		//since do_nothing is default, leave it in anyway, otherwise hide button
		const buttonDoNothing: JSX.Element | null =
			propsABCTables.doNothing === null
				? null
				: <><Button value={ABC_FILTER_VALUES.DO_NOTHING} onClick={this.onSetFilterABCTable}>{ABC_BUTTON_VALUES.DO_NOTHING}</Button></>
		const buttonWeaving: JSX.Element | null =
			propsABCTables.weaves === null
				? null
				: <><Button value={ABC_FILTER_VALUES.WEAVING} onClick={this.onSetFilterABCTable}>{ABC_BUTTON_VALUES.WEAVING}</Button></>
		const buttonInterrupts: JSX.Element | null =
			propsABCTables.interrupts === null
				? null
				: <><Button value={ABC_FILTER_VALUES.INTERRUPT} onClick={this.onSetFilterABCTable}>{ABC_BUTTON_VALUES.INTERRUPT}</Button></>
		const buttonDeaths: JSX.Element | null =
			propsABCTables.deaths === null
				? null
				: <><Button value={ABC_FILTER_VALUES.DEATH} onClick={this.onSetFilterABCTable}>{ABC_BUTTON_VALUES.DEATH}</Button></>

		let ABCTable: JSX.Element = <></>
		switch (tableFilterValue) {
		//default to first seen
		case null: {
			ABCTable = propsABCTables.weaves
				?? propsABCTables.interrupts
				?? propsABCTables.deaths
				?? propsABCTables.doNothing
				?? null
			break
		}
		case ABC_FILTER_VALUES.WEAVING: {
			ABCTable = propsABCTables.weaves
			break
		}
		case ABC_FILTER_VALUES.INTERRUPT: {
			ABCTable = propsABCTables.interrupts
			break
		}
		case ABC_FILTER_VALUES.DEATH: {
			ABCTable = propsABCTables.deaths
			break
		}
		case ABC_FILTER_VALUES.DO_NOTHING: {
			ABCTable = propsABCTables.doNothing
			break
		}
		}

		return <>
			<ButtonGroup>
				{buttonWeaving}
				{buttonInterrupts}
				{buttonDeaths}
				{buttonDoNothing}
			</ButtonGroup>
			<br/>
			{ABCTable}
		</>
	}
}

export default ABCTableFilter
