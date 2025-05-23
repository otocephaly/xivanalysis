import {StatusKey} from 'data/STATUSES'
import {StatusRoot} from 'data/STATUSES/root'
import {Attribute, DamageType} from 'event'
import {ensureRecord} from 'utilities/typescript'

export type ActionCombo =
	& (
		| {start: true, from?: never}
		| {from: number | number[], start?: never}
	)
	& {end?: true}

// Currently whether it's rear or flank doesn't matter.
export enum BonusModifier {
	COMBO,
	POSITIONAL,
}

// Similarly, BLU's Goblin Punch deals extra potency when
// cast under Mighty Guard (one of the tank stances).
// MNK GCDs deal extra potency when augmented with
// their respective Fury gauge.
export enum PotencySpecialCase {
	BLU_MIGHTY_GOBLIN_PUNCH,
	MNK_OPO_OPOS_FURY,
	MNK_RAPTORS_FURY,
	MNK_COEURLS_FURY,
}

// When calculating the bonusPercent that the game uses to display
// combo and positional success, BonusModifiers are the modifiers that
// will increase the percent. Statuses from jobs like RPR and DRG
// modify the base.
export type BaseModifier = PotencySpecialCase | StatusKey

// Potency is modeled this way because any single potency number
// can have a combination of states that apply to it, see all
// of the commented out PotencyModifiers. An empty modifier
// list means it's the base potency.
export interface Potency {
	value: number,
	baseModifiers?: BaseModifier[]
	bonusModifiers: BonusModifier[]
}

export interface Action {
	id: number
	name: string
	icon: string
	onGcd?: boolean
	breaksCombo?: boolean
	combo?: ActionCombo
	castTime?: number
	cooldown?: number
	gcdRecast?: number
	cooldownGroup?: number
	autoAttack?: boolean
	statusesApplied?: Array<keyof StatusRoot>
	charges?: number
	mpCost?: number
	damageType?: DamageType.MAGICAL | DamageType.PHYSICAL | DamageType.DARK
	/** Indicate whether this action's recast is adjusted by skill speed or spell speed.  Should be set for any onGCD skill or gcd-like skill that has a reduced recast based on speed stats */
	speedAttribute?: Attribute.SKILL_SPEED | Attribute.SPELL_SPEED
	potencies?: Potency[]
	// TODO: Do I need this still?
	// [key: string]: unknown
}

/*
	The properties defined here get narrowed too much by the `ensureActions`
	generic by default - we use some TS magic to forcefully widen them again.
	Expect to add this when dealing with top-level arrays.
*/
type TroublesomeProperties = 'statusesApplied' | 'combo'

export const ensureActions = ensureRecord<Action, TroublesomeProperties>()
