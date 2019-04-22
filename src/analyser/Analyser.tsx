import {MessageDescriptor} from '@lingui/core'
import {Actor, Events} from '@xivanalysis/parser-core'
import ErrorMessage from 'components/ui/ErrorMessage'
import {DependencyCascadeError} from 'errors'
import {ModulesNotFoundError} from 'errors'
import {MappedDependency} from 'parser/core/Module'
import React from 'react'
import toposort from 'toposort'
import {isDefined} from 'utilities'
import * as AVAILABLE_MODULES from './AVAILABLE_MODULES'
import {registerEvent} from './Events'
import {DISPLAY_MODE, Handle, Module} from './Module'

/*
👏    NO    👏
👏  FFLOGS  👏
👏  IN THE  👏
👏 ANALYSER 👏
*/

export interface Result {
	handle: string
	name: string | MessageDescriptor
	mode: DISPLAY_MODE
	markup: React.ReactNode
}

export const EventTypes = {
	INIT: registerEvent({
		name: 'Analyser/INIT',
		formatter: () => 'Analysis has begun.',
	}),
	COMPLETE: registerEvent({
		name: 'Analyser/COMPLETE',
		formatter: () => 'Analysis has concluded.',
	}),
}

// TODO: should this be in the parser?
const isAddActor = (event: Events.Base): event is Events.AddActor =>
	event.type === Events.Type.ADD_ACTOR

const generateActorFinder = (id: Actor['id']) =>
	(event: Events.Base): event is Events.AddActor =>
		isAddActor(event) && event.actor.id === id

export class Analyser {
	private readonly events: Events.Base[]
	private readonly actor: Actor
	private readonly zoneId: number

	/** Map of available modules. */
	private readonly modules = new Map<Handle, Module>()

	/** Module handles sorted per module loading order. */
	private moduleOrder: Handle[] = []

	private triggerModules: Handle[] = []
	private moduleErrors = new Map<Handle, Error>()

	private fabricationQueue: Events.Base[] = []

	constructor(opts: {
		events: Events.Base[],
		actorId: Actor['id'],
		zoneId: number,
	}) {
		this.events = opts.events
		this.zoneId = opts.zoneId

		// Find the AddActor event for the provided actor
		// If they aren't added, we can't analyse them, so throw
		const event = opts.events.find(generateActorFinder(opts.actorId))
		if (!event) {
			throw new Error('Could not find actor matching the ID specified.')
		}
		this.actor = event.actor
	}

	// -----
	// #region Module loading / initialisation
	// -----

	/** Initialise the analyser. */
	async init() {
		const constructors = await this.loadModules()
		this.buildModules(constructors)
	}

	private async loadModules() {
		// TODO: Job & zone
		// NOTE: Order of groups here is the order they will be loaded in. Later groups
		//       override earlier groups.
		const metas = [
			AVAILABLE_MODULES.CORE,
		].filter(isDefined)

		// Load in the modules
		// If this throws, then there was probably a deploy between page load and this call. Tell them to refresh.
		let groupedConstructors: ReadonlyArray<ReadonlyArray<typeof Module>>
		try {
			groupedConstructors = await Promise.all(metas.map(meta => meta.loadModules()))
		} catch (error) {
			if (process.env.NODE_ENV === 'development') {
				throw error
			}
			throw new ModulesNotFoundError()
		}

		const constructors: Record<string, typeof Module> = {}
		groupedConstructors.flat().forEach(constructor => {
			constructors[constructor.handle] = constructor
		})

		return constructors
	}

	private buildModules(constructors: Record<string, typeof Module>) {
		// Build the values we need for the toposort
		const nodes = Object.keys(constructors)
		const edges: Array<[string, string]> = []
		nodes.forEach(mod => constructors[mod].dependencies.forEach(dep => {
			edges.push([mod, this.getDepHandle(dep)])
		}))

		// Sort modules to load dependencies first
		// Reverse is required to switch it into depencency order instead of sequence
		// This will naturally throw an error on cyclic deps
		this.moduleOrder = toposort.array(nodes, edges).reverse()

		// Initialise the modules
		this.moduleOrder.forEach(mod => {
			this.modules.set(mod, new constructors[mod]({
				analyser: this,
			}))
		})
	}

	private getDepHandle(dep: string | MappedDependency) {
		if (typeof dep === 'string') {
			return dep
		}

		return dep.handle
	}

	// -----
	// #endregion
	// -----

	// -----
	// #region Event handling
	// -----

	// TODO: Normalisation? idek

	analyse() {
		// Copy of the module order we'll modify while analysing
		this.triggerModules = this.moduleOrder.slice()

		// Iterate over every event, inc. fabs, for each module
		for (const event of this.iterateEvents()) {
			this.triggerModules.forEach(handle => this.triggerEvent({
				handle,
				event,
			}))
		}
	}

	private *iterateEvents(): IterableIterator<Events.Base> {
		// Start the parse with an 'init' fab
		yield {
			timestamp: this.events[0].timestamp,
			type: EventTypes.INIT,
		}

		for (const event of this.events) {
			// Iterate over the actual event first
			yield event

			// Iterate over any fabrications arising from the event and clear the queue
			if (this.fabricationQueue.length > 0) {
				yield* this.fabricationQueue
				this.fabricationQueue = []
			}
		}

		// Finish with 'complete' fab
		yield {
			timestamp: this.events[this.events.length - 1].timestamp,
			type: EventTypes.COMPLETE,
		}
	}

	private triggerEvent({handle, event}: {
		handle: Handle,
		event: Events.Base,
	}) {
		try {
			const module = this.modules.get(handle)
			if (!module) {
				throw new Error(`Tried to access undefined module ${handle}`)
			}
			module.triggerEvent(event)
		} catch (error) {
			// If we're in dev, throw the error back up
			if (process.env.NODE_ENV === 'development') {
				throw error
			}

			// TODO: Sentry

			this.setModuleError({handle, error})
		}
	}

	private setModuleError({handle, error}: {
		handle: Handle,
		error: Error,
	}) {
		// Set the error for the module
		this.triggerModules.splice(this.triggerModules.indexOf(handle), 1)
		this.moduleErrors.set(handle, error)

		// Cascade the module through dependants
		this.triggerModules.slice().forEach(trigHandle => {
			const m = this.modules.get(trigHandle)
			if (!m) { return }

			const dependencies = (m.constructor as typeof Module).dependencies
			if (dependencies.some(dep => this.getDepHandle(dep) === handle)) {
				this.setModuleError({
					handle: trigHandle,
					error: new DependencyCascadeError({depencency: handle}),
				})
			}
		})
	}

	// -----
	// #endregion
	// -----

	// -----
	// #region Results handling
	// -----

	generateResults() {
		const displayOrder = this.moduleOrder.slice()

		const results = displayOrder
			.sort(this.moduleDisplaySortFn)
			.map(this.buildResult)
			.filter(isDefined)

		// TODO: Cache results

		return results
	}

	private moduleDisplaySortFn = (a: Handle, b: Handle) => {
		const aMod = this.modules.get(a)
		const bMod = this.modules.get(b)

		if (!aMod || !bMod) {
			return 0
		}

		const aCtor = (aMod.constructor as typeof Module)
		const bCtor = (bMod.constructor as typeof Module)

		return aCtor.displayOrder - bCtor.displayOrder
	}

	private buildResult = (handle: Handle): Result | undefined => {
		const module = this.modules.get(handle)
		if (!module) { return }

		const ctor = module.constructor as typeof Module

		const resultMeta = {
			name: ctor.title,
			handle,
			mode: ctor.displayMode,
		}

		// If the module errored, shortcut out with a render of the error
		const error = this.moduleErrors.get(handle)
		if (error) {
			return {
				...resultMeta,
				markup: <ErrorMessage error={error}/>,
			}
		}

		let output: React.ReactNode
		try {
			output = module.output()
		} catch (error) {
			if (process.env.NODE_ENV === 'development') {
				throw error
			}

			// TODO: Sentry

			return {
				...resultMeta,
				markup: <ErrorMessage error={error}/>,
			}
		}

		if (output !== null) {
			return {
				...resultMeta,
				markup: output,
			}
		}
	}

	// -----
	// #endregion
	// -----

	// -----
	// #region Utilities
	// -----

	relativeTimestamp(timestamp: number) {
		return timestamp - this.events[0].timestamp
	}

	formatTimestamp(timestamp: number, secondPrecision?: number) {
		return this.formatDuration(this.relativeTimestamp(timestamp), secondPrecision)
	}

	formatDuration(duration: number, secondPrecision: number = 2) {
		const floatSeconds = duration / 1000

		/* tslint:disable:no-magic-numbers */
		const m = Math.floor(floatSeconds / 60)
		const s = Math.floor(floatSeconds % 60).toString().padStart(2, '0')
		const ms = Math.round((floatSeconds % 1) * 10**secondPrecision).toString().padStart(secondPrecision, '0')
		/* tslint:enable:no-magic-numbers */

		return `${m}:${s}${secondPrecision > 0 && '.' + ms}`
	}

	// -----
	// #endregion
	// -----
}