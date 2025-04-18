import {RotationEvent} from 'components/ui/Rotation'
import {RotationTable, RotationTableNotesMap, RotationTableTargetData} from 'components/ui/RotationTable'
import {Event, Events} from 'event'
import {dependency} from 'parser/core/Injectable'
import {Timeline} from 'parser/core/modules/Timeline'
import {ensureArray, isDefined} from 'utilities'
import {Analyser} from '../../../Analyser'
import {EventFilterPredicate, EventHook} from '../../../Dispatcher'
import {filter, noneOf, oneOf} from '../../../filter'
import {Data} from '../../Data'
import {Suggestions} from '../../Suggestions'
import {EvaluatedAction} from '../EvaluatedAction'
import {EvaluationOutput, WindowEvaluator} from '../evaluators/WindowEvaluator'
import {History, HistoryEntry} from '../History'

export type HistoryEntryPredicate = (e: HistoryEntry<EvaluatedAction[]>) => boolean;

/**
 * Tracks actions that occur within a window.
 * By default, all actions cast during a window will be included.
 */
export abstract class ActionWindow extends Analyser {

	@dependency protected data!: Data
	@dependency protected suggestions!: Suggestions
	@dependency protected timeline!: Timeline

	/**
	 * The captured windows.
	 */
	protected history = new History<Array<Events['action']>>(() => [])
	/**
	 * The event filter used to capture events while a window is open.
	 * The default filter will capture all actions.
	 */
	private eventFilter: EventFilterPredicate<Events['action']> = filter<Event>().source(this.parser.actor.id).type('action')
	/**
	 * The history filter used to determine whether a history entry should be used in the output display.
	 * The default filter will allow all history entries.
	 */
	private historyOutputFilter: HistoryEntryPredicate = (_) => true
	/**
	 * The history filter used to determine whether a history entry should be used in the suggestions.
	 * The default filter will allow all history entries.
	 */
	private historySuggestionFilter: HistoryEntryPredicate = (_) => true

	/**
	 * The event hook for actions being captured.
	 */
	private eventHook?: EventHook<Events['action']>
	/**
	 * The evaluators used to generate suggestions and output for the windows.
	 */
	private evaluators: WindowEvaluator[] = []

	/**
	 * Implementing modules MAY provide a value to override the "Rotation" title in the header of the rotation section
	 * If implementing, you MUST provide a JSX.Element <Trans> or <Fragment> tag (Trans tag preferred)
	 */
	protected rotationTableHeader?: JSX.Element

	/**
	 * Implementing modules MAY provide a JSX element to appear above the RotationTable
	 * If prepending multiple nodes, you MUST provide a JSX.Element <Fragment> tag
	 */
	protected prependMessages?: JSX.Element
	/**
	 * Implementing modules MAY provide a JSX element to appear below the RotationTable
	 * If prepending multiple nodes, you MUST provide a JSX.Element <Fragment> tag
	 */
	protected appendMessages?: JSX.Element

	/**
	 * Adds an evaluator to be run on the windows.
	 * @param evaluator An evaluator to be run on the windows
	 */
	protected addEvaluator(evaluator: WindowEvaluator) {
		this.evaluators.push(evaluator)
	}

	/**
	 * Starts a new window if one is not already open.
	 * @param timestamp The timestamp at which the new window starts.
	 */
	protected onWindowStart(timestamp: number) {
		// The event hook may already be set if multiple onWindowStart calls happen
		// before a call to onWindowEnd
		if (this.eventHook == null) {
			this.eventHook = this.addEventHook(this.eventFilter, this.onWindowAction)
		}
		this.history.getCurrentOrOpenNew(timestamp)
	}
	/**
	 * Ends an existing window if one is open.
	 * @param timestamp The timestamp at which the window ends.
	 */
	protected onWindowEnd(timestamp: number) {
		// The event hook may already be cleared if multiple onWindowEnd calls happen
		// before a call to onWindowStart
		if (this.eventHook != null) {
			this.removeEventHook(this.eventHook)
			this.eventHook = undefined
		}
		this.history.closeCurrent(timestamp)
	}
	/**
	 * Adds an action to the current window if one is open.
	 * If no window is open, the event is ignored.
	 * @param event The event to be added to the window.
	 */
	protected onWindowAction(event: Events['action']) {
		this.history.doIfOpen(current => current.push(event))
	}

	/**
	 * Adjusts the event filter to ignore certain actions.
	 * Call this method if all casts of certain actions should be ignored
	 * in a window.
	 * If actions are only ignored in some conditions, this method is
	 * not suitable, and you will need to register your own hook via setEventFilter.
	 * @param actionsToIgnore The ids of the actions to ignore.
	 */
	protected ignoreActions(actionsToIgnore: number[]) {
		this.eventFilter = filter<Event>()
			.source(this.parser.actor.id)
			.action(noneOf(actionsToIgnore))
			.type('action')
	}
	/**
	 * Adjusts the event filter to only track certain actions.
	 * Call this method if only some actions should be tracked in a window.
	 * If other actions should be tracked in some conditions, this method is
	 * not suitable, and you will need to register your own hook via
	 * setEventFilter.
	 * @param actionsToTrack The ids of the actions to track.
	 */
	protected trackOnlyActions(actionsToTrack: number[]) {
		this.eventFilter = filter<Event>()
			.source(this.parser.actor.id)
			.action(oneOf(actionsToTrack))
			.type('action')
	}

	/**
	 * Sets a custom event filter for the actions to capture during
	 * a window.
	 * @param filter The filter for actions to capture during a window
	 */
	protected setEventFilter(filter: EventFilterPredicate<Events['action']>) {
		this.eventFilter = filter
	}

	/**
	 * Sets a custom history filter for displaying results and suggestions.
	 * @param filter The filter for history entries to consider
	 */
	protected setHistoryFilter(filter: HistoryEntryPredicate) {
		this.historyOutputFilter = filter
		this.historySuggestionFilter = filter
	}
	/**
	 * Sets a custom history filter for displaying results.
	 * @param filter The filter for history entries to consider
	 */
	protected setHistoryOutputFilter(filter: HistoryEntryPredicate) {
		this.historyOutputFilter = filter
	}
	/**
	 * Sets a custom history filter for displaying suggestions.
	 * @param filter The filter for history entries to consider
	 */
	protected setHistorySuggestionFilter(filter: HistoryEntryPredicate) {
		this.historySuggestionFilter = filter
	}

	override initialise() {
		this.addEventHook('complete', this.onComplete)
	}

	protected onComplete() {
		this.onWindowEnd(this.parser.pull.timestamp + this.parser.pull.duration)

		const actionHistory = this.mapHistoryActions()
		const filteredHistory = actionHistory.filter(this.historySuggestionFilter)
		this.evaluators
			.forEach(ev => {
				const suggestion = ev.suggest(filteredHistory)
				if (suggestion != null) {
					this.suggestions.add(suggestion)
				}
			})
	}

	override output() {
		const actionHistory = this.mapHistoryActions()
		const filteredHistory = actionHistory.filter(this.historyOutputFilter)
		if (filteredHistory.length === 0) { return undefined }

		const evalColumns: EvaluationOutput[] = []
		for (const ev of this.evaluators) {
			const maybeColumns = ev.output(filteredHistory)
			if (maybeColumns == null) { continue }
			for (const column of ensureArray(maybeColumns)) {
				evalColumns.push(column)
			}
		}

		const rotationTargets = evalColumns.filter(column => column.format === 'table').map(column => column.header)
		const notesData = evalColumns.filter(column => column.format === 'notes').map(column => column.header)
		const rotationData = filteredHistory
			.map((window, idx) => {
				const targetsData: RotationTableTargetData = {}
				const notesMap: RotationTableNotesMap = {}
				evalColumns.forEach(column => {
					if (typeof column.header.accessor !== 'string') { return }
					const colName = column.header.accessor
					if (column.format === 'table') {
						targetsData[colName] = column.rows[idx]
					} else {
						notesMap[colName] = column.rows[idx]
					}
				})
				return {
					start: window.start - this.parser.pull.timestamp,
					end: (window.end ?? window.start) - this.parser.pull.timestamp,
					targetsData,
					rotation: window.data.map(action => { return this.getRotationOutputForAction(action) }),
					notesMap,
				}
			})

		return <>
			{this.prependMessages}
			<RotationTable
				targets={rotationTargets}
				data={rotationData}
				notes={notesData}
				onGoto={this.timeline.show}
				headerTitle={this.rotationTableHeader}
			/>
			{this.appendMessages}
		</>
	}

	protected mapHistoryActions(): Array<HistoryEntry<EvaluatedAction[]>> {
		return this.history.entries
			.map(entry => ({
				start: entry.start,
				end: entry.end,
				data: entry.data
					.map(ev => {
						const action = this.data.getAction(ev.action)
						if (action == null) { return undefined }
						return {...ev, action}
					})
					.filter(isDefined),
			}))
	}

	protected getRotationOutputForAction(action: EvaluatedAction): RotationEvent {
		return {action: action.action.id}
	}
}
