import {Plural, Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {ActionKey} from 'data/ACTIONS'
import {Event} from 'event'
import {Analyser} from 'parser/core/Analyser'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {Actors} from 'parser/core/modules/Actors'
import {Data} from 'parser/core/modules/Data'
import {Suggestions, SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'

const SEVERITIES = {
	1: SEVERITY.MEDIUM,
	2: SEVERITY.MAJOR,
}

const STACK_BUILDERS: ActionKey [] = [
	'BLOOD_STALK',
	'GRIM_SWATHE',
	'UNVEILED_GALLOWS',
	'UNVEILED_GIBBET',
]

// These drop EVERY Reaver stack when used
const STACK_DROPPERS: ActionKey [] = [
	'SLICE',
	'WAXING_SLICE',
	'INFERNAL_SLICE',
	'SHADOW_OF_DEATH',
	'WHORL_OF_DEATH',
	'SOUL_SLICE',
	'SOUL_SCYTHE',
	'SOULSOW',
	'HARVEST_MOON',
	'HARPE',
	'NIGHTMARE_SCYTHE',
	'SPINNING_SCYTHE',
	'PLENTIFUL_HARVEST',
]

const STACK_CONSUMERS: ActionKey [] = [
	'GALLOWS',
	'GIBBET',
	'GUILLOTINE',
]

const REAVER_GAIN = 1 // Soul consuming moves grant 1 reaver
export class Reaver extends Analyser {
	static override handle = 'reaver'

	@dependency private data!: Data
	@dependency private suggestions!: Suggestions
	@dependency private actors!: Actors

	//Trackers
	private droppedReavers = 0
	private currentReaverStacks = 0

	override initialise() {
		super.initialise()

		const playerFilter = filter<Event>().source(this.parser.actor.id)

		this.addEventHook(playerFilter.type('action').action(this.data.matchActionId(STACK_BUILDERS)), this.onGain)
		this.addEventHook(playerFilter.type('action').action(this.data.matchActionId(STACK_CONSUMERS)), this.onUse)
		this.addEventHook(playerFilter.type('action').action(this.data.matchActionId(STACK_DROPPERS)), this.dropStacks)
		this.addEventHook(filter<Event>().type('death').actor(this.parser.actor.id), this.dropStacks)

		this.addEventHook('complete', this.onComplete)

	}

	private onGain() : void {
		// Overwriting existing stacks
		if (this.actors.current.hasStatus(this.data.statuses.SOUL_REAVER.id)) {
			this.dropStacks()
		}

		this.currentReaverStacks = REAVER_GAIN
	}

	private onUse() {
		if (this.actors.current.hasStatus(this.data.statuses.SOUL_REAVER.id)) {
			this.currentReaverStacks--
		}
	}

	private dropStacks() {
		this.droppedReavers += this.currentReaverStacks
		this.currentReaverStacks = 0
	}

	private onComplete() {
		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.BLOOD_STALK.icon,
			content: <Trans id = "rpr.reaver.suggestion.dropped.content">
				Avoid dropping <DataLink status="SOUL_REAVER"/> by using <DataLink action="GALLOWS"/>, <DataLink action="GIBBET"/>, or <DataLink action="GUILLOTINE"/>.
				These actions have high damage and grant you 10 Shroud gauge, giving you more chances to use <DataLink action="ENSHROUD"/> over the course of a fight.
			</Trans>,
			tiers: SEVERITIES,
			why: <Trans id ="rpr.reaver.suggestion.dropped.why">
					You lost <Plural value={this.droppedReavers} one="# stack" other="# stacks"/> over the course of the fight.
			</Trans>,
			value: this.droppedReavers,
		}))
	}
}
