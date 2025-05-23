import {Analyser} from 'parser/core/Analyser'
import {TimestampHookArguments, TimestampHookCallback} from 'parser/core/Dispatcher'
import {AbstractGauge, AbstractGaugeOptions} from './AbstractGauge'
import {GAUGE_HANDLE, ResourceData, ResourceGraphOptions} from '../ResourceGraphs/ResourceGraphs'

function expectExist<T>(value?: T) {
	if (!value) {
		throw new Error('Missing something required. Check the stack trace.')
	}

	return value
}

interface State {
	timestamp: number
	remaining: number
	paused: boolean
}

interface Window {
	start: number
	end: number
}

export interface TimerGaugeOptions extends AbstractGaugeOptions {
	/** Maxiumum duration of the gauge, in milliseconds. */
	maximum: number

	/** Callback executed when the timer expires. */
	onExpiration?: TimestampHookCallback

	/** Graph options. Omit to disable graphing for this gauge. */
	graph?: TimerGraphOptions,
}

type TimerGraphOptions = Omit<ResourceGraphOptions, ''> // Not currently omitting any options, but making easier to do so in the future

export interface TimerResourceData extends ResourceData {
	type: 'area'
}

export class TimerGauge extends AbstractGauge {
	// Just in case I ever have to change it lmao
	private readonly minimum = 0
	private readonly maximum: number
	private readonly expirationCallback?: TimestampHookCallback
	private readonly graphOptions?: ResourceGraphOptions

	private hook?: ReturnType<Analyser['addTimestampHook']>
	private history: State[] = []

	// TODO: Work out how to remove this reliance on having it passed down
	private _addTimestampHook?: Analyser['addTimestampHook']
	private get addTimestampHook() { return expectExist(this._addTimestampHook) }

	private _removeTimestampHook?: Analyser['removeTimestampHook']
	private get removeTimestampHook() { return expectExist(this._removeTimestampHook) }

	/** The most recent state  */
	private get lastKnownState() {
		const {length} = this.history
		if (length === 0) {
			return
		}
		return this.history[length - 1]
	}

	/** Time currently remaining on the timer. */
	get remaining() {
		// If there's no known state, we have to assume there's no time left
		if (!this.lastKnownState) {
			return this.minimum
		}

		// If we're paused, the time remaining always === specified state remaining
		if (this.lastKnownState.paused) {
			return this.lastKnownState.remaining
		}

		const delta = this.parser.currentEpochTimestamp - this.lastKnownState.timestamp
		return Math.max(this.minimum, this.lastKnownState.remaining - delta)
	}

	/** Whether the gauge has expired. */
	get expired() {
		return this.remaining <= this.minimum
	}

	/** Whether the gauge is currently paused. */
	get paused() {
		// If there's no state, we're neither paused nor running - but safer to assume running.
		if (!this.lastKnownState) {
			return false
		}

		return this.lastKnownState.paused
	}

	/** Whether the gauge is currently running */
	get active(): boolean {
		return !(this.expired || this.paused)
	}

	constructor(opts: TimerGaugeOptions) {
		super(opts)

		this.maximum = opts.maximum
		this.expirationCallback = opts.onExpiration
		this.graphOptions = opts.graph
	}

	/** @inheritdoc */
	reset() {
		this.set(this.minimum)
	}

	/**
	 * Start the timer from its maximum value
	 */
	start() {
		this.set(this.maximum)
	}

	/**
	 * Refresh the gauge to its maximum value.
	 * If the gauge has expired, this will have no effect.
	 */
	refresh(onlyIfRunning: boolean = true) {
		if (this.expired && onlyIfRunning) {
			return
		}
		this.start()
	}

	/**
	 * Add time to the gauge. Time over the maxium will be lost.
	 * If the gauge has expired, this will have no effect.
	 */
	extend(duration: number, onlyIfRunning: boolean = true) {
		if (this.expired && onlyIfRunning) {
			return
		}
		this.set(this.remaining + duration)
	}

	/** Pause the timer at its current state. */
	pause() {
		this.set(this.remaining, true)
	}

	/** Resume the timer from its paused state. */
	resume() {
		this.set(this.remaining, false)
	}

	/** Set the time remaining on the timer to the given duration. Value will be bounded by provided maximum. */
	set(duration: number, paused: boolean = false) {
		const timestamp = this.parser.currentEpochTimestamp

		// Push the timer state prior to the event into the history
		this.history.push({
			timestamp,
			remaining: this.remaining,
			paused: this.paused,
		})

		const remaining = Math.max(this.minimum, Math.min(duration, this.maximum))

		// Push a new state onto the history
		this.history.push({
			timestamp,
			remaining,
			paused,
		})

		// Remove any existing hook
		if (this.hook) {
			this.removeTimestampHook(this.hook)
		}

		// If we've not yet expired, and we're not paused, set up a hook to wait for that
		if (!paused && remaining > 0) {
			this.hook = this.addTimestampHook(timestamp + remaining, this.onExpiration)
		}
	}

	raise() { /** noop */ }

	init() {
		if (this.history.length === 0) {
			this.reset()
		}
	}

	private onExpiration = (args: TimestampHookArguments) => {
		if (this.expirationCallback) {
			this.expirationCallback(args)
		}
		this.history.push({
			timestamp: this.parser.currentEpochTimestamp,
			remaining: this.remaining,
			paused: false,
		})
	}

	/** @inheritdoc */
	override generateResourceGraph() {
		// Skip charting if they've not enabled it
		if (!this.graphOptions) {
			return
		}

		// Insert a data point at the end of the timeline
		this.pause()

		const {handle, label, color, tooltipHideWhenEmpty, tooltipHideMaximum} = this.graphOptions
		const graphData: TimerResourceData = {
			label,
			colour: color ?? 'black',
			data: this.history.map(entry => {
				return {time: entry.timestamp, current: entry.remaining / 1000, maximum: this.maximum / 1000}
			}),
			linear: true,
			tooltipHideWhenEmpty,
			tooltipHideMaximum,
			type: 'area',
		}
		if (handle != null) {
			this.resourceGraphs.addDataGroup({...this.graphOptions, handle})
			this.resourceGraphs.addData(handle, graphData)
		} else {
			this.resourceGraphs.addGauge(graphData, {...this.graphOptions, handle: GAUGE_HANDLE})
		}
	}

	// Junk I wish I didn't need
	setAddTimestampHook(value: Analyser['addTimestampHook']) {
		this._addTimestampHook = value
	}

	setRemoveTimestampHook(value: Analyser['removeTimestampHook']) {
		this._removeTimestampHook = value
	}

	private internalExpirationTime(start: number = this.parser.pull.timestamp, end: number = this.parser.currentEpochTimestamp, downtimeWindows: Window[] = [], reapplyAfterDowntime: number = 0) {
		let currentStart: number | undefined = undefined
		const expirationWindows: Window[] = []

		this.history.forEach(entry => {
			if (entry.remaining <= this.minimum && currentStart == null) {
				currentStart = entry.timestamp
			}
			if (entry.remaining > this.minimum && currentStart != null) {
				// Don't clutter the windows if the expiration of the timer may also restart it (Polyglot, Lilies, etc.)
				if (entry.timestamp > currentStart) {
					expirationWindows.push({start: currentStart, end: entry.timestamp})
				}
				currentStart = undefined
			}
		})

		if (expirationWindows.length === 0) { return [] }

		const expirations: Window[] = []
		expirationWindows.forEach(expiration => {
			// If the expiration had some duration within the time range we're asking about, we'll add it
			if ((expiration.end > start || expiration.start < end)) {
				/**
				 * If we were given any downtime windows, check if this expiration started within one, and change the effective start of the expiration
				 * to the end of the downtime window, plus any additional leniency if specified
				 */
				if (downtimeWindows.length > 0) {
					downtimeWindows.filter(uta => expiration.start >= uta.start && expiration.start <= uta.end)
						.forEach(uta => expiration.start = Math.min(expiration.end, uta.end + reapplyAfterDowntime))
				}
				// If the window still has any effective duration, we'll return it
				if (expiration.start < expiration.end) {
					expirations.push(expiration)
				}
			}
		})

		return expirations
	}

	/**
	 * Gets whether the timer was expired at a particular time
	 * @param when The timestamp in question
	 * @returns True if the timer was expired at this timestamp, false if it was active or paused
	 */
	public isExpired(when: number = this.parser.currentEpochTimestamp) {
		return this.internalExpirationTime(when, when).length > 0
	}

	/**
	 * Gets the total amount of time that the timer was expired during a given time range.
	 * @param start The start of the time range. To forgive time at the start of the fight, set this to this.parser.pull.timestamp + forgivenness amount
	 * @param end The end of the time range.
	 * @param downtimeWindows Pass to forgive any expirations that began within one of these windows of time. The start of any affected expiration will be reset to the end of the affecting window
	 *     When using a timer that should only forgive expirations when you are completely unable to act, use the windows from UnableToAct.getWindows()
	 *     To also forgive expirations due to death or due to no enemy being targetable, use the windows from Downtime.getWindows()
	 * @param reapplyAfterDowntime Pass to grant additional leniency when an expiration occurred during a downtime window. This is added to the end of the window when recalculating the expiration start time
	 * @returns The total effective time that the timer was expired for
	 */
	public getExpirationTime(start: number = this.parser.pull.timestamp, end: number = this.parser.currentEpochTimestamp, downtimeWindows: Window[] = [], reapplyAfterDowntime: number = 0) {
		return this.internalExpirationTime(start, end, downtimeWindows, reapplyAfterDowntime).reduce(
			(totalExpiration, currentWindow) => totalExpiration + Math.min(currentWindow.end, end) - Math.max(currentWindow.start, start),
			0,
		)
	}
	/**
	 * Gets the array of windows that the timer was expired for during a given time range.
	 * @param start The start of the time range. To forgive time at the start of the fight, set this to this.parser.pull.timestamp + forgivenness amount
	 * @param end The end of the time range.
	 * @param downtimeWindows Pass to forgive any expirations that began within one of these windows of time. The start of any affected expiration will be reset to the end of the affecting window
	 *     When using a timer that should only forgive expirations when you are completely unable to act, use the windows from UnableToAct.getWindows()
	 *     To also forgive expirations due to death or due to no enemy being targetable, use the windows from Downtime.getWindows()
	 * @param reapplyAfterDowntime Pass to grant additional leniency when an expiration occurred during a downtime window. This is added to the end of the window when recalculating the expiration start time
	 * @returns The array of expiration windows
	 */
	public getExpirationWindows(start: number = this.parser.pull.timestamp, end: number = this.parser.currentEpochTimestamp, downtimeWindows: Window[] = [], reapplyAfterDowntime: number = 0) {
		return this.internalExpirationTime(start, end, downtimeWindows, reapplyAfterDowntime).reduce<Window[]>(
			(windows, window) => {
				windows.push({
					start: Math.max(window.start, start),
					end: Math.min(window.end, end),
				})
				return windows
			},
			[],
		)
	}
}
