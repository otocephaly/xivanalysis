import {Trans} from '@lingui/react'
import {Status} from 'data/STATUSES'
import {Events} from 'event'
import _ from 'lodash'
import {EvaluatedAction, EvaluationOutput, NotesEvaluator} from 'parser/core/modules/ActionWindow'
import {HistoryEntry} from 'parser/core/modules/ActionWindow/History'
import {ensureArray} from 'utilities'
import {Actor} from '../../Actors'

export interface RaidBuffOverwriteEvaluatorOpts {
	raidBuffApplications: Array<Events['statusApply']>
	buffStatus: Status | Status[]
	playerId: Actor['id']
	playerBuffedTargets: Array<Actor['id']>
}

const MULTI_JOB_ERROR = {
	NONE: 0,
	THEY_OVERWROTE: 1,
	YOU_OVERWROTE: 2,
}

export class RaidBuffOverwriteEvaluator extends NotesEvaluator {
	private raidBuffApplications: Array<Events['statusApply']>
	private buffStatus: Status | Status[]
	private playerId: Actor['id']
	private playerBuffedTargets: Array<Actor['id']>

	header = {
		header: <Trans id="core.raidbuffwindow.table.header.interference">Window Interference</Trans>,
		accessor: 'interference',
	}

	constructor(opts: RaidBuffOverwriteEvaluatorOpts) {
		super()
		this.raidBuffApplications = opts.raidBuffApplications
		this.buffStatus = opts.buffStatus
		this.playerId = opts.playerId
		this.playerBuffedTargets = opts.playerBuffedTargets
	}

	override output(windows: Array<HistoryEntry<EvaluatedAction[]>>): EvaluationOutput | undefined {
		const notes = windows.map(window => this.determineError(window))
		if (notes.every(note => note === MULTI_JOB_ERROR.NONE)) {
			return undefined
		}

		return super.output(windows)
	}

	override generateNotes(buffWindow: HistoryEntry<EvaluatedAction[]>) {
		const error = this.determineError(buffWindow)

		switch (error) {
		case MULTI_JOB_ERROR.THEY_OVERWROTE:
			return <Trans id="core.raidbuffwindow.interference.notes.they-overwrote">Overwritten by Other Player</Trans>
		case MULTI_JOB_ERROR.YOU_OVERWROTE:
			return <Trans id="core.raidbuffwindow.interference.notes.you-overwrote">You Overwrote an Existing Window</Trans>
		default:
			return <></>
		}
	}

	private determineError(buffWindow: HistoryEntry<EvaluatedAction[]>): number {
		const actualWindowDuration = (buffWindow?.end ?? buffWindow.start) - buffWindow.start
		const buffDuration = _.max(ensureArray(this.buffStatus).map(s => s.duration)) ?? 0
		const lookbackStart = buffWindow.start - buffDuration

		// we check whether or not you overwrote someone else first, as you
		// can directly control that
		const otherPlayerLookbackApplications = this.raidBuffApplications.filter(ba => {
			return (
				ba.source !== this.playerId &&
				this.playerBuffedTargets.includes(ba.target) &&
				lookbackStart <= ba.timestamp &&
				ba.timestamp <= buffWindow.start
			)
		})

		// don't be rude
		if (otherPlayerLookbackApplications.length > 0) {
			return MULTI_JOB_ERROR.YOU_OVERWROTE
		}

		// next, we check if someone else overwrote you
		const otherPlayerApplications = this.raidBuffApplications.filter(ba => {
			return (
				ba.source !== this.playerId &&
				this.playerBuffedTargets.includes(ba.target) &&
				buffWindow.start <= ba.timestamp &&
				ba.timestamp <= buffWindow.start + actualWindowDuration
			)
		})

		// whoops looks like the other player overwrote you, bummer
		if (otherPlayerApplications.length > 0) {
			return MULTI_JOB_ERROR.THEY_OVERWROTE
		}

		// otherwise we're all good
		return MULTI_JOB_ERROR.NONE
	}
}
