import {Trans} from '@lingui/react'
import {DataLink} from 'components/ui/DbLink'
import {Interrupts as CoreInterrupts} from 'parser/core/modules/Interrupts'
import {DISPLAY_ORDER} from './DISPLAY_ORDER'

export class Interrupts extends CoreInterrupts {
	static override displayOrder = DISPLAY_ORDER.INTERRUPTED_CASTS
	override suggestionContent = <Trans id="rdm.interrupts.suggestion.content">
		Avoid interrupting casts by either prepositioning yourself or utilizing slidecasting where possible. If you need to move, try to save a use of <DataLink action="SWIFTCAST"/>, <DataLink action="ACCELERATION"/>, or pool mana for a melee combo or if none of these are available use <DataLink action="ENCHANTED_REPRISE"/>.
	</Trans>
}
