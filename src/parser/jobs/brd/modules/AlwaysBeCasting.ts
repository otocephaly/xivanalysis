import {Event, Events} from 'event'
import {filter, oneOf} from 'parser/core/filter'
import {AlwaysBeCasting as CoreAlwaysBeCasting} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'

interface ArmyWindow {
	start: number
	end: number
}

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	private armyHistory: ArmyWindow[] = []
	private currentArmy: ArmyWindow | undefined = undefined

	override initialise() {
		super.initialise()

		const armyFilter = filter<Event>()
			.source(this.parser.actor.id)
			.status(oneOf([this.data.statuses.ARMYS_MUSE.id, this.data.statuses.ARMYS_PAEON.id]))

		this.addEventHook(armyFilter.type('statusApply'), this.onApplyArmy)
		this.addEventHook(armyFilter.type('statusRemove'), this.onRemoveArmy)
	}

	private onApplyArmy(event: Events['statusApply']) {
		if (this.currentArmy != null) { return }

		this.currentArmy = {
			start: event.timestamp,
			end: this.parser.pull.timestamp + this.parser.pull.duration,
		}

		this.armyHistory.push(this.currentArmy)
	}

	private onRemoveArmy(event: Events['statusRemove']) {
		if (this.currentArmy != null) {
			this.currentArmy.end = event.timestamp
			this.currentArmy = undefined
		}
	}

	override checkAndSave(endTime: number, event?: Events['action']) {
		const tracker = this.noCastWindows
		// Because Army's Paeon and Army's Muse reduce GCD speed by a variable amount that we can't synthesize, we exclude skills used under either buff from GCD uptime analysis
		if (this.currentArmy != null && tracker.current !== undefined)  {
			this.debug(`Army's buff ignored this window ending at ${this.parser.formatEpochTimestamp(endTime)}.`)
			tracker.current.ignoreWindowIncludingUptime = true
		}

		super.checkAndSave(endTime, event)
	}
}
