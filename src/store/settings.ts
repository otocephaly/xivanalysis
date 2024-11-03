import {action, observable} from 'mobx'

export class SettingsStore {
	@observable killsOnly: boolean = true
	@observable showMinorSuggestions: boolean = false
	@observable bypassCacheNextRequest: boolean = false
	@observable filterABCTable: string | null = null

	@action
	setViewKillsOnly(value: boolean) {
		this.killsOnly = value
	}

	@action
	setShowMinorSuggestions(value: boolean) {
		this.showMinorSuggestions = value
	}

	@action
	setBypassCacheNextRequest(value: boolean) {
		this.bypassCacheNextRequest = value
	}

	@action
	setFilterABCTable(value: string) {
		this.filterABCTable = value
	}
}

export const settingsStore = new SettingsStore()
