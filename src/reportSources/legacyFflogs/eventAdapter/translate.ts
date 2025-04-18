import * as Sentry from '@sentry/browser'
import {STATUS_ID_OFFSET} from 'data/STATUSES'
import {Event, Events, Cause, SourceModifier, TargetModifier, AttributeValue, Attribute, EventGaugeUpdate} from 'event'
import {Actor} from 'report'
import {resolveActorId} from '../base'
import {ActorResources, BuffEvent, BuffStackEvent, CastEvent, CombatantInfoEvent, DamageEvent, DeathEvent, FflogsEvent, GaugeUpdateEvent, HealEvent, HitType, InstaKillEvent, TargetabilityUpdateEvent} from '../eventTypes'
import {AdapterStep} from './base'

/*
NOTES:
- FFLogs uses an ID offset for statuses. It's currently handled throughout the application - once legacy handling is removed, we can safely contain the offset in the adaption.
- FFLogs re-attributes limit break results to a special actor, resulting in two actions (one from the original, one from fabricated), then all follow-up data being on the fabricated actor. We should adapt that back to the caster.
*/

/** Mapping from FFLogs hit types to source-originating modifiers. */
const sourceHitType: Partial<Record<HitType, SourceModifier>> = {
	[HitType.MISS]: SourceModifier.MISS,
	[HitType.CRITICAL]: SourceModifier.CRITICAL,
	// Marking dodge as miss 'cus it seems to be mis-used as such on fflogs
	[HitType.DODGE]: SourceModifier.MISS,
}

/** Mapping from FFLogs hit types to target-originating modifiers. */
const targetHitType: Partial<Record<HitType, TargetModifier>> = {
	[HitType.BLOCK]: TargetModifier.BLOCK,
	[HitType.PARRY]: TargetModifier.PARRY,
	[HitType.IMMUNE]: TargetModifier.INVULNERABLE,
}

/* eslint-disable @typescript-eslint/no-magic-numbers */
/** Mapping from FFLogs actions that are effect-only and don't map to a specific calculateddamage or calculatedheal event */
const EFFECT_ONLY_ACTIONS = new Set([
	1302, // Regeneration
	500000, // Combined DoTs
	500001, // Combined HoTs
])

/** Mapping from failed actions that are effect-only and don't map to a specific calculateddamage or calculatedheal event */
const FAILED_HITS = new Set([
	HitType.MISS,
	HitType.DODGE,
	HitType.IMMUNE,
	HitType.RESIST,
])
/* eslint-enable @typescript-eslint/no-magic-numbers */

// Equivalent to an UnreachableException, but as a noop function
const ensureNever = (arg: never) => arg

const BYTE_FIELD_OFFSETS = {
	FIRST: 0,
	SECOND: 1,
	THIRD: 2,
	FOURTH: 3,
}

const GAUGE_JOB_IDS = {
	MONK: 20,
	BARD: 23,
	DANCER: 38,
}

const CHARS_PER_HEX_WORD = 8

/** Translate an FFLogs APIv1 event to the xiva representation, if any exists. */
export class TranslateAdapterStep extends AdapterStep {
	private unhandledTypes = new Set<string>()
	// Using negatives so we don't tread on fflog's positive sequence IDs
	private nextFakeSequence = -1
	private loggingActorId: Actor['id'] = ''
	private lastGaugeUpdate: EventGaugeUpdate | undefined = undefined

	override adapt(baseEvent: FflogsEvent, _adaptedEvents: Event[]): Event[] {
		switch (baseEvent.type) {
		case 'begincast':
		case 'cast':
			return [this.adaptCastEvent(baseEvent)]

		case 'instakill':
			return this.adaptInstantKillEvent(baseEvent)

		case 'calculateddamage':
			return this.adaptDamageEvent(baseEvent)
		case 'calculatedheal':
			return this.adaptHealEvent(baseEvent)

		case 'damage':
		case 'heal':
			return this.adaptEffectEvent(baseEvent)

		case 'applybuff':
		case 'applydebuff':
		case 'refreshbuff':
		case 'refreshdebuff':
			return [this.adaptStatusApplyEvent(baseEvent)]

		case 'applybuffstack':
		case 'applydebuffstack':
		case 'removebuffstack':
		case 'removedebuffstack':
			return [this.adaptStatusApplyDataEvent(baseEvent)]

		case 'removebuff':
		case 'removedebuff':
			return [this.adaptStatusRemoveEvent(baseEvent)]

		case 'death':
			return [this.adaptDeathEvent(baseEvent)]

		case 'targetabilityupdate':
			return [this.adaptTargetableEvent(baseEvent)]

		case 'combatantinfo':
			return this.adaptCombatantInfoEvent(baseEvent)

		case 'gaugeupdate':
			return this.adaptGaugeUpdateEvent(baseEvent)

		/* eslint-disable no-fallthrough */
		// Dispels are already modelled by other events, and aren't something we really care about
		case 'dispel':
		// FFLogs computed value, could be useful in the future for shield healing analysis.
		case 'absorbed':
		case 'interrupt':
		// Encounter events don't expose anything particularly useful for us
		case 'encounterstart':
		case 'encounterend':
		case 'dungeonstart':
		case 'dungeonend':
		// Seems to be related to instance seals in i.e. 24mans?
		case 'instancesealupdate':
		// We don't have much need for limit break, at least for now
		case 'limitbreakupdate':
		// We are _technically_ limiting down to a single zone, so any zonechange should be fluff
		case 'zonechange':
		// We don't really use map events
		case 'mapchange':
		// Could be interesting to do something with, but not important for analysis
		case 'worldmarkerplaced':
		case 'worldmarkerremoved':
		// Seem to be representation of mechanics - interesting data, but likely not useful for analysis without in-depth per-fight logic.
		case 'headmarker':
		case 'tether':
		// Not My Problem™️
		case 'checksummismatch':
		// New event type from unreleased (as of 2021/04/26) fflogs client. Doesn't contain anything useful.
		case 'wipecalled':
		// I mean if Kihra doesn't know, how am I supposed to?
		case 'unknown':
			break
			/* eslint-enable no-fallthrough */

		default: {
			// Anything that reaches this point is unknown. If we've already notified, just noop
			const unknownEvent = ensureNever(baseEvent) as {type: string}
			if (this.unhandledTypes.has(unknownEvent.type)) {
				break
			}

			// Report missing event types to sentry & mark as reported
			Sentry.withScope(scope => {
				scope.setExtras({
					report: this.report.meta.code,
					event: baseEvent,
				})
				Sentry.captureMessage(`adapter.fflogs.unhandled.${unknownEvent.type}`)
			})
			if (process.env.NODE_ENV === 'development') {
				console.warn(`Unhandled FFLogs event type "${unknownEvent.type}".`)
			}
			this.unhandledTypes.add(unknownEvent.type)
		}
		}

		return []
	}

	private adaptCastEvent(event: CastEvent): Events['prepare' | 'action'] {
		return {
			...this.adaptTargetedFields(event),
			type: event.type === 'begincast' ? 'prepare' : 'action',
			action: event.ability.guid,
		}
	}

	private adaptEffectEvent(event: DamageEvent | HealEvent): Array<Events['execute' | 'damage' | 'heal' | 'actorUpdate']> {
		// Calc events should all have a packet ID for sequence purposes. Otherwise, this is a damage or heal effect packet for an over time effect.
		const sequence = event.packetID

		const cause = resolveCause(event.ability.guid)

		// As of ~6.08, FF Logs reports a packetID that links all `damage` events from a single DOT application, however these still do not have calculated events.
		if (sequence == null || cause.type === 'status') {
			// Damage over time or Heal over time effects are sent as damage/heal events without a sequence ID -- there is no execute confirmation for over time effects, just the actual damage or heal event
			// Similarly, certain failed hits will generate an "unpaired" event
			if (
				cause.type === 'status'
				|| EFFECT_ONLY_ACTIONS.has(event.ability.guid)
				|| FAILED_HITS.has(event.hitType)
			) {
				if (event.type === 'damage') { return this.adaptDamageEvent(event, true) }
				if (event.type === 'heal') { return this.adaptHealEvent(event, true) }
			}

			// Damage event with no sequence ID to match to a calculated damage event, and does not resolve as an over time effect
			// No longer throwing because we are not seeing these unmatched packets except for logs created before patch 5.08, but need an early return to make type hinting know sequence isn't null below
			return []
		}

		const targetedFields = this.adaptTargetedFields(event)
		const newEvent: Events['execute'] = {
			...targetedFields,
			type: 'execute',
			action: event.ability.guid,
			sequence,
		}

		return [newEvent, ...this.buildActorUpdateResourceEvents(event)]
	}

	private adaptInstantKillEvent(event: InstaKillEvent): Event[] {
		const {targetResources: target} = event

		// Instant kills don't seem to include a sequence, so we're faking it
		const sequence = this.nextFakeSequence--
		const bonusPercent = event.bonusPercent ?? 0

		// Build the primary damage event for the instakill.
		const damageEvent: Events['damage'] = {
			...this.adaptSourceFields(event),
			type: 'damage',
			cause: resolveCause(event.ability.guid),
			sequence,
			targets: [{
				...resolveTargetId(event),
				// We don't get any amount for an instakill, fake it with the target's HP.
				amount: target.maxHitPoints,
				bonusPercent,
				overkill: target.maxHitPoints - target.hitPoints,
				// No hit type either, just assume normal.
				sourceModifier: SourceModifier.NORMAL,
				targetModifier: TargetModifier.NORMAL,
			}],
		}

		// Instakills don't seem to have an effect, so we're building one.
		const executeEvent: Events['execute'] = {
			...this.adaptTargetedFields(event),
			type: 'execute',
			action: event.ability.guid,
			sequence,
		}

		return [
			damageEvent,
			...this.buildActorUpdateResourceEvents(event),
			executeEvent,
		]
	}

	private adaptDamageEvent(event: DamageEvent, omitSequence: boolean = false): Array<Events['damage' | 'actorUpdate']> {
		const sequence = omitSequence ? undefined : event.packetID

		// Calculate source modifier
		let sourceModifier = sourceHitType[event.hitType] ?? SourceModifier.NORMAL
		if (event.multistrike) {
			sourceModifier = sourceModifier === SourceModifier.CRITICAL
				? SourceModifier.CRITICAL_DIRECT
				: SourceModifier.DIRECT
		}

		// Build the new event
		const overkill = event.overkill ?? 0
		const bonusPercent = event.bonusPercent ?? 0
		const newEvent: Events['damage'] = {
			...this.adaptSourceFields(event),
			type: 'damage',
			cause: resolveCause(event.ability.guid),
			sequence,
			targets: [{
				...resolveTargetId(event),
				// fflogs subtracts overkill from amount, amend
				amount: event.amount + overkill,
				bonusPercent,
				overkill,
				sourceModifier,
				targetModifier: targetHitType[event.hitType] ?? TargetModifier.NORMAL,
			}],
		}

		return [newEvent, ...this.buildActorUpdateResourceEvents(event)]
	}

	private adaptHealEvent(event: HealEvent, omitSequence: boolean = false): Array<Events['heal' | 'actorUpdate']> {
		const sequence = omitSequence ? undefined : event.packetID
		const overheal = event.overheal ?? 0

		const newEvent: Events['heal'] = {
			...this.adaptSourceFields(event),
			type: 'heal',
			cause: resolveCause(event.ability.guid),
			sequence,
			targets: [{
				...resolveTargetId(event),
				// fflogs substracts overheal from amount, amend
				amount: event.amount + overheal,
				overheal,
				sourceModifier: sourceHitType[event.hitType] ?? SourceModifier.NORMAL,
			}],
		}

		return [newEvent, ...this.buildActorUpdateResourceEvents(event)]
	}

	private adaptStatusApplyEvent(event: BuffEvent | BuffStackEvent): Events['statusApply'] {
		return {
			...this.adaptTargetedFields(event),
			type: 'statusApply',
			status: resolveStatusId(event.ability.guid),
			// Omitting duration, as it's not exposed by fflogs in any way.
		}
	}

	private adaptStatusApplyDataEvent(event: BuffStackEvent): Events['statusApply'] {
		const newEvent = this.adaptStatusApplyEvent(event)
		newEvent.data = event.stack
		return newEvent
	}

	private adaptStatusRemoveEvent(event: BuffEvent): Events['statusRemove'] {
		return {
			...this.adaptTargetedFields(event),
			type: 'statusRemove',
			status: resolveStatusId(event.ability.guid),
			remainingShield: event.absorb,
		}
	}

	private buildActorUpdateResourceEvents(event: DamageEvent | HealEvent | InstaKillEvent) {
		const {source, target} = resolveActorIds(event)

		const newEvents: Array<Events['actorUpdate']> = []

		if (event.targetResources) {
			newEvents.push(this.buildActorUpdateResourceEvent(target, event.targetResources, event))
		}

		if (event.sourceResources) {
			newEvents.push(this.buildActorUpdateResourceEvent(source, event.sourceResources, event))
		}

		return newEvents
	}

	private buildActorUpdateResourceEvent(
		actorId: Actor['id'],
		resources: ActorResources,
		event: FflogsEvent,
	): Events['actorUpdate'] {
		return {
			...this.adaptBaseFields(event),
			type: 'actorUpdate',
			actor: actorId,
			hp: {current: resources.hitPoints, maximum: resources.maxHitPoints},
			mp: {current: resources.mp, maximum: resources.maxMP},
			position: {x: resources.x, y: resources.y, bearing: resources.facing},
		}
	}

	private adaptDeathEvent(event: DeathEvent): Events['actorUpdate'] {
		return {
			...this.adaptBaseFields(event),
			type: 'actorUpdate',
			actor: resolveActorId({
				id: event.targetID,
				instance: event.targetInstance,
				actor: event.target,
			}),
			hp: {current: 0},
			mp: {current: 0},
		}
	}

	private adaptTargetableEvent(event: TargetabilityUpdateEvent): Events['actorUpdate'] {
		return {
			...this.adaptBaseFields(event),
			type: 'actorUpdate',
			actor: resolveActorId({
				id: event.targetID,
				instance: event.targetInstance,
				actor: event.target,
			}),
			targetable: !!event.targetable,
		}
	}

	private adaptCombatantInfoEvent(event: CombatantInfoEvent): Array<Events['actorUpdate'] | Events['statusApply']> {
		// TODO: Use more info in here. We're currently extracting the speed attribute values for the logging player, but there's also player level, prepull statuses, and more in there.

		const attributeMapping: Array<[number | undefined, Attribute]> = [
			[event.skillSpeed, Attribute.SKILL_SPEED],
			[event.spellSpeed, Attribute.SPELL_SPEED],
		]

		const attributes: AttributeValue[] = []

		for (const [value, attribute] of attributeMapping) {
			if (value == null) { continue }
			attributes.push({attribute, value, estimated: false})
			this.loggingActorId = resolveActorId({
				id: event.sourceID,
				instance: event.sourceInstance,
				actor: event.source,
			})
		}

		const ourEvents = new Array<Events['actorUpdate'] | Events['statusApply']>()

		if (event.level != null) {
			ourEvents.push({
				...this.adaptBaseFields(event),
				type: 'actorUpdate',
				level: event.level,
				actor: resolveActorId({
					id: event.sourceID,
					instance: event.sourceInstance,
					actor: event.source,
				}),
			})
		}

		// "Auras" seems to be a holdover from WoW, but over here they mainly cover Stances;
		// Tank Stance (Grit, etc), as well as the BLU mimickries.
		// The minimum thing we can do here is just report these as a statusApply at the
		// start of each pull.
		event.auras.forEach(aura => {
			const statusApplyEvent: Events['statusApply'] = {
				...this.adaptBaseFields(event),
				type: 'statusApply',
				// The source of each of the buffs is marked on the aura object itself, whereas the target is the source actor of the combatant info.
				source: resolveActorId({id: aura.source}),
				target: resolveActorId({id: event.sourceID, instance: event.sourceInstance, actor: event.source}),
				status: resolveStatusId(aura.ability),
			}
			ourEvents.push(statusApplyEvent)
		})

		if (attributes.length !== 0) {
			const actorUpdateEvent: Events['actorUpdate'] = {
				...this.adaptBaseFields(event),
				type: 'actorUpdate',
				attributes,
				actor: resolveActorId({
					id: event.sourceID,
					instance: event.sourceInstance,
					actor: event.source,
				}),
			}
			ourEvents.push(actorUpdateEvent)
		}
		return ourEvents
	}

	private adaptGaugeUpdateEvent(event: GaugeUpdateEvent): Event[] {
		// It seems like the last hex byte from data1 corresponds to the job ID code for all of the gauges
		const jobId = numberFromHexBytes(event.data1, BYTE_FIELD_OFFSETS.FOURTH)

		switch (jobId) {
		case GAUGE_JOB_IDS.DANCER:
			return this.adaptDancerGaugeEvent(event)
		case GAUGE_JOB_IDS.BARD:
			return this.adaptBardGaugeEvent(event)
		case GAUGE_JOB_IDS.MONK:
			return this.adaptMonkGaugeEvent(event)
		default:
			return []
		}
	}

	private adaptDancerGaugeEvent(event: GaugeUpdateEvent): Event[] {
		const adaptedEvent: Events['gaugeUpdate'] = {
			...this.adaptBaseFields(event),
			actor: this.loggingActorId, // Relies on there being a combatant info event first...
			type: 'gaugeUpdate',
			esprit: numberFromHexBytes(event.data1, BYTE_FIELD_OFFSETS.SECOND),
			feathers: numberFromHexBytes(event.data1, BYTE_FIELD_OFFSETS.THIRD),
		}
		// Only return an adapted event if something we care about actually changed
		if (this.lastGaugeUpdate == null ||
			('esprit' in this.lastGaugeUpdate && this.lastGaugeUpdate.esprit !== adaptedEvent.esprit) ||
			('feathers' in this.lastGaugeUpdate && this.lastGaugeUpdate.feathers !== adaptedEvent.feathers)
		) {
			this.lastGaugeUpdate = adaptedEvent
			return [adaptedEvent]
		}
		return []
	}

	private adaptBardGaugeEvent(event: GaugeUpdateEvent): Event[] {
		const adaptedEvent: Events['gaugeUpdate'] = {
			...this.adaptBaseFields(event),
			actor: this.loggingActorId, // Relies on there being a combatant info event first...
			type: 'gaugeUpdate',
			repertoire: numberFromHexBytes(event.data2, BYTE_FIELD_OFFSETS.THIRD),
			soulVoice: numberFromHexBytes(event.data2, BYTE_FIELD_OFFSETS.SECOND),
			coda: numberFromHex(event.data3, 2, 0, 1, 'nibble'),
			song: numberFromHex(event.data3, 2, 1, 1, 'nibble'),
		}
		return [adaptedEvent]
	}

	private adaptMonkGaugeEvent(event: GaugeUpdateEvent): Event[] {
		const adaptedEvent: Events['gaugeUpdate'] = {
			...this.adaptBaseFields(event),
			actor: this.loggingActorId, // Relies on there being a combatant info event first...
			type: 'gaugeUpdate',
			chakra: numberFromHexBytes(event.data1, BYTE_FIELD_OFFSETS.THIRD),
		}

		// Only return an adapted event if something we care about actually changed
		if (this.lastGaugeUpdate == null ||
			('chakra' in this.lastGaugeUpdate && this.lastGaugeUpdate.chakra !== adaptedEvent.chakra)
		) {
			this.lastGaugeUpdate = adaptedEvent
			return [adaptedEvent]
		}
		return []
	}

	private adaptTargetedFields(event: FflogsEvent) {
		return {
			...this.adaptBaseFields(event),
			...resolveActorIds(event),
		}
	}

	private adaptSourceFields(event: FflogsEvent) {
		return {
			...this.adaptBaseFields(event),
			...resolveSourceId(event),
		}
	}

	private adaptBaseFields(event: FflogsEvent) {
		return {timestamp: this.report.timestamp + event.timestamp}
	}
}

const numberFromHexBytes = (hexWord: string, offset: number = 0, bytes: number = 1): number => {
	return numberFromHex(hexWord, CHARS_PER_HEX_WORD, offset, bytes, 'byte')
}

const numberFromHex = (hexWord: string, wordSize: number, offset: number, amount: number, unit: 'byte'|'nibble') => {
	const substringSize = (unit === 'byte' ? 2 : 1) * amount
	const startIndex = offset * substringSize
	if (offset < 0 || startIndex > (wordSize - substringSize)) { return 0 }

	const paddedWord = hexWord.padStart(wordSize, '0')
	const endIndex = startIndex + substringSize
	const substring = paddedWord.substring(startIndex, endIndex)

	return Number('0x' + substring)
}

const resolveActorIds = (event: FflogsEvent) => ({
	...resolveSourceId(event),
	...resolveTargetId(event),
})

const resolveSourceId = (event: FflogsEvent) => ({
	source: resolveActorId({
		id: event.sourceID,
		instance: event.sourceInstance,
		actor: event.source,
	}),
})

const resolveTargetId = (event: FflogsEvent) => ({
	target: resolveActorId({
		id: event.targetID,
		instance: event.targetInstance,
		actor: event.target,
	}),
})

const resolveCause = (fflogsAbilityId: number): Cause =>
	fflogsAbilityId < STATUS_ID_OFFSET
		? {type: 'action', action: fflogsAbilityId}
		: {type: 'status', status: resolveStatusId(fflogsAbilityId)}

// TODO: When removing legacy, resolve status IDs without the offset
const resolveStatusId = (fflogsStatusId: number) =>
	fflogsStatusId
