import {Plural, Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Action} from 'data/ACTIONS'
import _ from 'lodash'
import {EvaluatedAction, EvaluationOutput, WindowEvaluator} from 'parser/core/modules/ActionWindow'
import {HistoryEntry} from 'parser/core/modules/ActionWindow/History'
import {ChargeHistoryEntry, Cooldowns} from 'parser/core/modules/Cooldowns'
import {SEVERITY, Suggestion, TieredSuggestion} from 'parser/core/modules/Suggestions'
import {PerfectBalance} from '../PerfectBalance'

/**
 * We leave space for roughly 4 GCDs at the end of the window when
 * determining whether or not a RoF window could have contained
 * another masterful blitz usage (3 PB GCDs + 1 MB GCD)
 */
const END_OF_WINDOW_TOLERANCE = 8000

// Assuming a roughly six minute kill time a standard rotation would
// have 11 blitz usages, arbitrarily marking missing more than half of
// those as a major issue with rotation execution.
const BLITZ_SEVERITY_TIERS = {
	1: SEVERITY.MINOR,
	3: SEVERITY.MEDIUM,
	6: SEVERITY.MAJOR,
}

// Normally we only expect the player to fit at most two blitzes into a RoF
const MAX_EXPECTED_BLITZES = 2
// If a blitz is already ready to go, and both PB charges are available, it's barely possible to fit three into a single RoF
const MAX_POSSIBLE_BLITZES = 3

interface BlitzEvaluatorOpts {
	blitzActions: Array<Action['id']>,
	blitzIcon: string
	maxCharges: number
	perfectBalance: PerfectBalance
	cooldowns: Cooldowns
	pullEnd: number
	pbAction: Action
}

interface BlitzWindowResults {
	expected: number
	actual: number
}
export class BlitzEvaluator implements WindowEvaluator {
	private blitzActions: Array<Action['id']>
	private blitzIcon: string
	private maxCharges: number
	private perfectBalance: PerfectBalance
	private cooldowns: Cooldowns
	private pullEnd: number
	private pbAction: Action

	private pbChargeHistory: ChargeHistoryEntry[] = []
	private windowResults: BlitzWindowResults[]

	constructor(opts: BlitzEvaluatorOpts) {
		this.blitzActions = opts.blitzActions
		this.blitzIcon = opts.blitzIcon
		this.maxCharges = opts.maxCharges
		this.perfectBalance = opts.perfectBalance
		this.cooldowns = opts.cooldowns
		this.pullEnd = opts.pullEnd
		this.pbAction = opts.pbAction

		this.windowResults = []
	}

	suggest(windows: Array<HistoryEntry<EvaluatedAction[]>>): Suggestion {
		this.calculateWindowStats(windows)
		const badWindows = this.windowResults.filter(res => res.actual < res.expected)
		const missedBlitzes = _.sumBy(badWindows, res => res.expected - res.actual)

		return new TieredSuggestion({
			icon: this.blitzIcon,
			content: <Trans id="mnk.rof.suggestions.blitz.content">
				Try to hit two uses of <DataLink action="MASTERFUL_BLITZ"/> in both the opener and every 'even' <DataLink action="RIDDLE_OF_FIRE"/> window and one usage of <DataLink action="MASTERFUL_BLITZ"/> in every 'odd' window, as the blitz actions are your strongest skills.
			</Trans>,
			tiers: BLITZ_SEVERITY_TIERS,
			value: missedBlitzes,
			why: <Trans id="mnk.rof.suggestions.blitz.why">
				<Plural value={missedBlitzes} one="# use of" other="# uses of"/> <DataLink action="MASTERFUL_BLITZ"/> <Plural value={missedBlitzes} one="was" other="were"/> missed during {badWindows.length} <DataLink action="RIDDLE_OF_FIRE"/> <Plural value={badWindows.length} one ="window" other="windows"/>.
			</Trans>,
		})
	}

	output(windows: Array<HistoryEntry<EvaluatedAction[]>>): EvaluationOutput {
		this.calculateWindowStats(windows)
		return {
			format: 'table',
			header: {
				header: <DataLink showName={false} action="MASTERFUL_BLITZ"/>,
				accessor: 'masterfulblitz',
			},
			rows: this.windowResults,
		}
	}

	private calculateWindowStats(windows: Array<HistoryEntry<EvaluatedAction[]>>): void {
		if (this.windowResults.length === windows.length) {
			return
		}

		this.calculateRechargeTimes()
		this.windowResults = windows.map(window => {
			return {
				actual: this.countBlitzes(window),
				expected: this.expectedBlitzes(window),
			}
		})
	}

	private calculateRechargeTimes(): void {
		if (this.pbChargeHistory.length === 0) {
			this.pbChargeHistory = this.cooldowns.chargeHistory(this.pbAction)
		}
	}

	private countBlitzes(window: HistoryEntry<EvaluatedAction[]>): number {
		return window.data.filter(value => this.blitzActions.includes(value.action.id)).length
	}

	private expectedBlitzes(window: HistoryEntry<EvaluatedAction[]>): number {
		// We expect the player to burn off PB charges that were available when the window began, and any that became available with enough time before the window ended
		const chargesBeforeWindow = (_.last(this.pbChargeHistory.filter(entry => entry.timestamp < window.start))?.current ?? this.maxCharges)
		const chargesInWindow = this.pbChargeHistory.some(entry => entry.delta > 0 && entry.timestamp > window.start && entry.timestamp <= (window.end ?? this.pullEnd) - END_OF_WINDOW_TOLERANCE) ? 1 : 0

		// If we entered the window with a PB already active and have enough time to use it before the window ends, expect that to get used too
		const pbActive = this.perfectBalance.inBalance(window.start) && window.start + END_OF_WINDOW_TOLERANCE < (window.end ?? this.pullEnd)

		// Total up the potential uses
		const castsAvailable = chargesBeforeWindow + chargesInWindow + (pbActive ? 1 : 0)

		// If we're going into RoF with a blitz prepped, we can fit 3 blitzes in 11 GCDs (or at least one, if we're a short window at the end of the fight)
		if (this.perfectBalance.blitzReady(window.start)) {
			return Math.max(Math.min(castsAvailable, MAX_POSSIBLE_BLITZES), 1)
		}

		// Otherwise we only expect up to two blitzes
		return Math.min(castsAvailable, MAX_EXPECTED_BLITZES)
	}
}
