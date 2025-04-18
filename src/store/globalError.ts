import {GlobalError} from 'errors'
import {action, observable} from 'mobx'

export class GlobalErrorStore {
	@observable accessor error: GlobalError | undefined

	@action
	setGlobalError(error: GlobalError) {
		this.error = error
	}

	@action
	clearGlobalError() {
		this.error = undefined
	}
}

export const globalErrorStore = new GlobalErrorStore()
