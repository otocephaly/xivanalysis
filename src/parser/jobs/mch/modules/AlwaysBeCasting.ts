import {Event, Events} from 'event'
import {EventHook} from 'parser/core/Dispatcher'
import {filter, noneOf} from 'parser/core/filter'
import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

interface FlameWindow {
	start: number
	end: number
}

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	private flameHistory: FlameWindow[] = []
	private currentFlame: FlameWindow | undefined = undefined
	private flamethrowerInterruptingActionHook?: EventHook<Events['action']>

	override initialise() {
		super.initialise()

		const playerFilter = filter<Event>().source(this.parser.actor.id)
		const flamethrowerCastFilter = playerFilter
			.action(this.data.actions.FLAMETHROWER.id)
			.type('action')
		const flamethrowerStatusFilter = playerFilter
			.status(this.data.statuses.FLAMETHROWER.id)
			.type('statusRemove')

		this.addEventHook(flamethrowerCastFilter, this.onApplyFlamethrower)
		this.addEventHook(flamethrowerStatusFilter, this.onRemoveFlamethrower)
	}

	private onApplyFlamethrower(event: Events['action']) {
		if (this.currentFlame != null) { return }

		this.currentFlame = {
			start: event.timestamp,
			end: event.timestamp + this.data.statuses.FLAMETHROWER.duration,
		}
		const anyActionFilter = filter<Event>()
			.source(this.parser.actor.id)
			.action(noneOf([this.data.actions.FLAMETHROWER.id]))
			.type('action')
		this.flamethrowerInterruptingActionHook = this.addEventHook(anyActionFilter, this.onRemoveFlamethrower)

		this.flameHistory.push(this.currentFlame)
	}

	private onRemoveFlamethrower(event: Events['statusRemove'] | Events['action']) {
		if (this.currentFlame == null) {
			return
		}
		if (this.flamethrowerInterruptingActionHook == null) {
			return
		}

		this.currentFlame.end = event.timestamp
		this.removeEventHook(this.flamethrowerInterruptingActionHook)

		this.currentFlame = undefined
		this.flamethrowerInterruptingActionHook = undefined

	}

	override checkAndSave(endTime: number, event?: Events['action']) {
		const tracker = this.noCastWindows
		if (tracker.current !== undefined && event !== undefined && event.type === 'action' && event.action === this.data.actions.FLAMETHROWER.id) {
			this.debug(`Flamethrower ignored this window between ${this.parser.formatEpochTimestamp(tracker.current?.start)} and ${this.parser.formatEpochTimestamp(endTime)}.`)
			tracker.current.ignoreWindowIncludingUptime = true
		}

		super.checkAndSave(endTime, event)
	}
}
