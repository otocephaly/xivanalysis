import {Plural, Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Event, Events} from 'event'
import {filter, oneOf} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {History} from 'parser/core/modules/ActionWindow/History'
import {Actors} from 'parser/core/modules/Actors'
import {ABCWindow, AnimationLock, AlwaysBeCasting as CoreAlwaysBeCasting, OGCD_OFFSET, REACTION_TIME} from 'parser/core/modules/AlwaysBeCasting/AlwaysBeCasting'
import {SimpleStatistic, Statistics} from 'parser/core/modules/Statistics'
import {TieredSuggestion, SEVERITY} from 'parser/core/modules/Suggestions'

const PHANTOM_FLURRY_CHANNEL_DURATION_MAX_MS = 5000
const PHANTOM_FLURRY_CHANNEL_WITH_KICK_DURATION_MS = 4000

const APOKALYPSIS_CHANNEL_DURATION_MAX_MS = 10000

const MAX_ALLOWED_MULTIWEAVE_DURING_MOON_FLUTE = 6

const SURPANAKHA_ANIMATION_LOCK_MS = 1000
const MAX_SURPANAKHA_CHARGES = 4

// Essentially a carbon copy of the MCH extension to ABC -- we want to treat
// Phantom Flurry as a Flamethrower-like.

// This also removes the time under Waning Nocturne (the second half of Moon Flute)
// from the ABC report. Can't cast, am waning.

interface ChannelWindow {
	manualKick: boolean
	inMoonFlute: boolean
	actionId: number
}

interface MoonfluteWindow {
	startTime: number
	endTime: number
}

export class AlwaysBeCasting extends CoreAlwaysBeCasting {
	private channelHistory: History<ChannelWindow> = new History<ChannelWindow>(() => ({
		manualKick: false,
		inMoonFlute: false,
		actionId: 0,
	}))
	private surpanakhas: number = 0
	private badSurpanakhasChains: number = 0
	protected override actionsWithExtraAnimationLock: AnimationLock[] = [
		{
			actionID: this.data.actions.SURPANAKHA.id,
			timeLocked: SURPANAKHA_ANIMATION_LOCK_MS,
		},
	]
	private moonfluteWindows: MoonfluteWindow[] = []
	private moonfluteStartTime: number | undefined = undefined

	private timeSpentInDiamondBack: number = 0
	private startTimeDiamondBack: number | undefined = undefined
	private phantomManualKick: boolean = false

	override gcdUptimeSuggestionContent: JSX.Element = <Trans id="blu.always-cast.description">
		Make sure you're always doing something. It's often better to make small
		mistakes while keeping the GCD rolling than it is to perform the correct
		rotation slowly.
		<br />
		For BLU, we count the following as (1) GCD uptime or as (2) downtime:
		<ul>
			<li>(1) The <DataLink action="PHANTOM_FLURRY" /> and <DataLink action="APOKALYPSIS" /> channels</li>
			<li>(1) The <DataLink action="SURPANAKHA" /> oGCD spam added to expected GCD time for ease of reference</li>
			<li>(2) Time spent under <DataLink action="DIAMONDBACK" /></li>
			<li>(2) <DataLink status="WANING_NOCTURNE" />, the forced downtime following a <DataLink action="MOON_FLUTE" /></li>
		</ul>
	</Trans>

	@dependency private actors!: Actors
	@dependency private statistics!: Statistics

	override initialise() {
		super.initialise()

		const playerFilter = filter<Event>().source(this.parser.actor.id)

		//diamondback
		const diamondBackFilter = playerFilter.status(this.data.statuses.DIAMONDBACK.id)
		this.addEventHook(diamondBackFilter.type('statusApply'), this.onDiamondBackApply)
		this.addEventHook(diamondBackFilter.type('statusRemove'), this.onDiamondBackRemove)

		//surpana
		const surpanakhaCastFilter = playerFilter
			.action(this.data.actions.SURPANAKHA.id)
			.type('action')
		this.addEventHook(surpanakhaCastFilter, this.onCastSurpanakha)

		//phantom
		const channelCastFilter = playerFilter
			.action(oneOf([this.data.actions.PHANTOM_FLURRY.id, this.data.actions.APOKALYPSIS.id]))
			.type('action')
		const channelStatusFilter = playerFilter
			.status(oneOf([this.data.statuses.PHANTOM_FLURRY.id, this.data.statuses.APOKALYPSIS.id]))
			.type('statusRemove')
		const phantomFlurryKick = playerFilter
			.action(this.data.actions.PHANTOM_FLURRY_KICK.id)
			.type('action')
		this.addEventHook(channelCastFilter, this.onApplyChannel)
		this.addEventHook(channelStatusFilter, this.onRemoveChannel)
		this.addEventHook(phantomFlurryKick, this.onPhantomFlurryFinalKick)

		//waxing -- used to track max allowable weaves
		this.addEventHook(playerFilter.status(this.data.statuses.WAXING_NOCTURNE.id).type('statusApply'), this.waxOn)
		this.addEventHook(playerFilter.status(this.data.statuses.WAXING_NOCTURNE.id).type('statusRemove'), this.waxOff)
	}

	private onDiamondBackApply(event: Events['statusApply']) {
		const tracker = this.noCastWindows.current
		this.startTimeDiamondBack = event.timestamp
		if (tracker === undefined) { return }
		tracker.ignoreWindowIncludingUptime = true
	}

	private onDiamondBackRemove(event: Events['statusRemove']) {
		//consider starting of new window in case they stop doing things right after (allow for reaction time)
		this.checkAndSave(event.timestamp)
		this.noCastWindows.current = {
			leadingGCDTime: event.timestamp,
			expectedGCDDuration: REACTION_TIME,
			availableOGCDTime: 0,
			doNothingForegivness: 0,
			actions: [],
			isDeath: false,
			ignoreWindowIncludingUptime: false,
		}
		if (this.startTimeDiamondBack === undefined) { return } //can't really do much about this if we don't have the data
		this.timeSpentInDiamondBack += event.timestamp - this.startTimeDiamondBack
		this.startTimeDiamondBack = undefined //reset until next window
	}

	private onCastSurpanakha(event: Events['action']) {
		const tracker = this.noCastWindows.current
		//for weaving purposes, surpanakha is fine to count and we will include this in gcd time for ease of tracking
		if (tracker !== undefined && event.action === this.data.actions.SURPANAKHA.id) {
			this.surpanakhas++
			tracker.expectedGCDDuration += SURPANAKHA_ANIMATION_LOCK_MS
		}
	}

	override onCast(event: Events['action']) {

		const tracker = this.noCastWindows.current
		if (tracker !== undefined && (event.action === this.data.actions.PHANTOM_FLURRY.id || event.action === this.data.actions.APOKALYPSIS.id)) {
			const actionName = this.data.getAction(event.action)?.name
			this.debug(`${actionName} began channeling at ${this.parser.formatEpochTimestamp(event.timestamp)}`)
		}

		super.onCast(event)
	}

	private onPhantomFlurryFinalKick() {
		// We go in here when someone uses Phantom Flurry and, instead of channeling
		// the entire effect, instead presses the button a second time.
		// For DPSes this is always bad, since you want Phantom Flurry to finish
		// off your Moon Flute. For tank/healer, pressing this button at the last
		// possible moment is a DPS gain.
		//
		// So let's just use a very simple heuristic. We'll say that we expect
		// the full 5000ms channel, BUT, if they used the kick, then they should
		// have waited at least 4000ms for most of the channel to have happened.

		const allChannels = this.channelHistory.entries
		if (allChannels.length === 0) { return }
		const currentChannel = allChannels[allChannels.length - 1]
		if (currentChannel === null) { return }
		currentChannel.data.manualKick = true
		this.phantomManualKick = true
	}

	private onApplyChannel(event: Events['action']) {
		const newChannel = this.channelHistory.openNew(event.timestamp)
		newChannel.data.inMoonFlute = this.actors.current.hasStatus(this.data.statuses.WAXING_NOCTURNE.id)
		newChannel.data.actionId = event.action
	}

	private onRemoveChannel(event: Events['statusRemove']) {
		this.channelHistory.closeCurrent(event.timestamp)
		const tracker = this.noCastWindows.current
		if (tracker !== undefined && !tracker.ignoreWindowIncludingUptime) {
			tracker.expectedGCDDuration = event.timestamp - tracker.leadingGCDTime
		}
	}

	private waxOn(event: Events['statusApply']) {
		if (this.moonfluteStartTime === undefined) {
			this.moonfluteStartTime = event.timestamp
		}
	}

	private waxOff(event: Events['statusRemove']) {
		if (this.moonfluteStartTime === undefined) { return }
		this.moonfluteWindows.push({
			startTime: this.moonfluteStartTime,
			endTime: event.timestamp,
		})
		this.moonfluteStartTime = undefined
	}

	override determineBadWeave(window: ABCWindow): boolean {
		const windowEndTime: number = window?.trailingGCDTime ?? window.leadingGCDTime

		//only want the max weaves for super under moonflute. Note: super under normal circumstances is already considered above.
		const windowInMoonfluteWithSurp: boolean = this.moonfluteWindows.filter(mfWindow => (
			mfWindow.startTime <= window.leadingGCDTime && mfWindow.endTime >= window.leadingGCDTime)
			|| (mfWindow.startTime <= windowEndTime && (mfWindow.endTime >= windowEndTime)
			)).length !== 0
			&& window.actions.filter(ogcdActions => ogcdActions.action === this.data.actions.SURPANAKHA.id).length !== 0
		//want only whole available oGCDs during window
		// note: adding an OGCD_OFFSET since there is already a lot of clipping for BLU. this is used to reduce noise
		const availableOGCDs: number = Math.max(Math.floor((window.expectedGCDDuration - window.availableOGCDTime + OGCD_OFFSET) / OGCD_OFFSET), 0)
		let checkIfBad: boolean = false
		if (windowInMoonfluteWithSurp) {
			checkIfBad = window.actions.length > Math.max(MAX_ALLOWED_MULTIWEAVE_DURING_MOON_FLUTE, availableOGCDs)
		} else {
			checkIfBad = window.actions.length > availableOGCDs
		}
		return checkIfBad
	}

	protected override checkAndSave(endTime: number, event?: Events['action']): void {
		//special case for surp where we want to check if all 4 had been casted in a row, if not add it to the tally
		const tracker = this.noCastWindows.current
		let surpChainNumber: number = 0
		if (
			tracker !== undefined
			&& tracker.actions.filter(action => action.action === this.data.actions.SURPANAKHA.id).length !== 0
		) {
			tracker.actions.forEach(action => {
				if (action.action === this.data.actions.SURPANAKHA.id) {
					surpChainNumber += 1
				}
			})
		}
		if (surpChainNumber !== MAX_SURPANAKHA_CHARGES) {
			this.badSurpanakhasChains += 1
		}

		// if phantom flurry last kick, add it to GCD since not technically recorded in initial window
		if (this.phantomManualKick && this.noCastWindows.current !== undefined) {
			this.noCastWindows.current.expectedGCDDuration = this.gcd.getDuration()
			this.phantomManualKick = false
		}

		super.checkAndSave(endTime, event)
	}

	override onComplete(event: Events['complete']) {
		super.onComplete(event)

		const endOfPullTimestamp = this.parser.pull.timestamp + this.parser.pull.duration
		this.channelHistory.closeCurrent(endOfPullTimestamp)
		//close out diamond back
		if (this.startTimeDiamondBack !== undefined) {
			this.timeSpentInDiamondBack = event.timestamp - this.startTimeDiamondBack
		}

		if (this.timeSpentInDiamondBack !== 0) {
			this.statistics.add(new SimpleStatistic({
				title: <Trans id="blue.diamondback.statistic.time">Time in Diamondback</Trans>,
				icon: this.data.actions.DIAMONDBACK.icon,
				value: this.parser.formatDuration(this.timeSpentInDiamondBack),
				info: <Trans id="blu.diamondback.statistic.info">
					The ABC report will count time spent under <DataLink action="DIAMONDBACK" /> as GCD uptime, but you should still aim to minimize this, since it means dropping damaging GCDs.
				</Trans>,
			}))
		}

		// Since we were already tracking Phantom Flurry, go ahead and take
		// the chance to track if they dropped any damage ticks.
		const missingFlurryTicks = this.channelHistory.entries
			.filter(channel => channel.data.actionId === this.data.actions.PHANTOM_FLURRY.id)
			.reduce((acc, flurry) => {
				const flurryChannelMs = (flurry.end ?? endOfPullTimestamp) - flurry.start
				const expectedFlurryChannel = (flurry.data.manualKick ? PHANTOM_FLURRY_CHANNEL_WITH_KICK_DURATION_MS : PHANTOM_FLURRY_CHANNEL_DURATION_MAX_MS)
				const missingFlurryChannelMs = expectedFlurryChannel - flurryChannelMs
				if (missingFlurryChannelMs <= 0) { return acc }

				const missingTicks = Math.ceil(missingFlurryChannelMs / 1000)
				return acc + missingTicks
			}, 0)
		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.PHANTOM_FLURRY.icon,
			content: <Trans id="blu.phantom_flurry.dropped_ticks.content">
				Dropping out of <DataLink action="PHANTOM_FLURRY" /> too early will lose damage ticks. If you are in a <DataLink action="MOON_FLUTE" /> window you want to wait out the entire channel. If you are using it outside of a window and activating the final kick, wait until the last second the <DataLink status="PHANTOM_FLURRY" showIcon={false} /> effect is active.
			</Trans>,
			why: <Trans id="blu.phantom_flurry.dropped_ticks.why">
				<Plural value={missingFlurryTicks} one="# Phantom Flurry tick was" other="# Phantom Flurry ticks were" /> dropped due to cancelling the channel too early.
			</Trans>,
			tiers: {
				1: SEVERITY.MINOR,  // 200/300 potency
				2: SEVERITY.MEDIUM, // 400/600 potency
				3: SEVERITY.MAJOR,  // 600/900 potency
			},
			value: missingFlurryTicks,
		}))

		// And also report missing ticks for Apokalypsis
		const missingApokalypsisTicks = this.channelHistory.entries
			.filter(channel => channel.data.actionId === this.data.actions.APOKALYPSIS.id)
			.reduce((acc, apoka) => {
				const apokaChannelMs = (apoka.end ?? endOfPullTimestamp) - apoka.start
				const missingChannelMs = APOKALYPSIS_CHANNEL_DURATION_MAX_MS - apokaChannelMs
				if (missingChannelMs <= 0) { return acc }

				const missingTicks = Math.ceil(missingChannelMs / 1000)
				return acc + missingTicks
			}, 0)
		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.APOKALYPSIS.icon,
			content: <Trans id="blu.apokalypsis.dropped_ticks.content">
				Dropping out of <DataLink action="APOKALYPSIS" /> too early will lose damage ticks.
			</Trans>,
			why: <Trans id="blu.apokalypsis.dropped_ticks.why">
				<Plural value={missingApokalypsisTicks} one="# Apokalypsis tick was" other="# Apokalypsis ticks were" /> dropped due to cancelling the channel too early.
			</Trans>,
			tiers: {
				1: SEVERITY.MINOR,  // 140 pot
				2: SEVERITY.MEDIUM, // 380 pot
				3: SEVERITY.MAJOR,  // 520 pot
			},
			value: missingApokalypsisTicks,
		}))

		// If they weren't in a Moon Flute, then they should have kicked!
		const missingFlurryKicks = this.channelHistory.entries
			.filter(channel => channel.data.actionId === this.data.actions.PHANTOM_FLURRY.id)
			.filter(flurry => !flurry.data.inMoonFlute && !flurry.data.manualKick)
			.length

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.PHANTOM_FLURRY_KICK.icon,
			content: <Trans id="blu.phantom_flurry.dropped_kicks.content">
				While the channel from <DataLink action="PHANTOM_FLURRY" /> is active, it becomes <DataLink action="PHANTOM_FLURRY_KICK" />, a 600 potency button. If you are using <DataLink action="PHANTOM_FLURRY" showIcon={false} /> outside of a <DataLink action="MOON_FLUTE" showIcon={false} /> window, then you should use the 600 potency button before the channel runs out. Use this even if it means dropping the last tick of the channel.
			</Trans>,
			why: <Trans id="blu.phantom_flurry.dropped_kicks.why">
				<Plural value={missingFlurryKicks} one="# Phantom Flurry big kick was" other="# Phantom Flurry big kicks were" /> dropped by not pressing the button again before the effect ran out.
			</Trans>,
			tiers: {
				1: SEVERITY.MEDIUM, // 390 potency
				2: SEVERITY.MAJOR, // 780 potency
			},
			value: missingFlurryKicks,
		}))

		//surp suggestion
		// Give a suggestion for people who didn't use Surpanakha x4, losing the buff and
		// a bunch of damage.
		//
		// There's an edge case here -- Some fights you may want to delay your Moon Flute window by
		// 30 seconds, at which point you might as well use a single charge of Surpanakha rather than
		// having it go to waste.
		//
		// But if people are clever & skilled enough to do that kind of optimization, then they're
		// clever enough to understand that they can disregarding the misfiring message.
		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.SURPANAKHA.icon,
			content: <Trans id="blu.weaving.bad_surpanakha.content">
				Use all four <DataLink action="SURPANAKHA" /> charges at the same time, with no other actions in-between. Even <DataLink action="SPRINT" showIcon={false} /> or using an item will cancel the buff.
			</Trans>,
			why: <Trans id="blu.weaving.bad_surpanakha.why">
				<Plural value={this.badSurpanakhasChains} one="# Surpanakha chain" other="# Surpanakha chains" /> dropped the buff early.
			</Trans>,
			tiers: {1: SEVERITY.MAJOR},
			value: this.badSurpanakhasChains,
		}))
	}
}
