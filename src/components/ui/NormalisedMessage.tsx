import {I18n, MessageDescriptor} from '@lingui/core'
import {Trans, withI18n} from '@lingui/react'

interface Props {
	i18n: I18n
	message: string | MessageDescriptor
	id?: string
}

function NormalisedMessageImpl({message, id, i18n}: Props) {
	return typeof message === 'string'
		? <Trans id={id} defaults={message}/>
		: <>{i18n._(message)}</>
}

export const NormalisedMessage = withI18n()(NormalisedMessageImpl)
