import axios from 'axios'
import fs from 'fs'

main().catch(e => {
	console.error(e)
	process.exit(1)
})

interface XivapiResponse<T> {
	next?: string
	schema: string,
	results: Array<XivapiResult<T>>
}

interface XivapiResult<T> {
	score: number,
	sheet: string,
	row_id: number,
	subrow_id?: number
	fields: T
}

interface XivapiStatus {
	Name: string
	LockActions: boolean
	LockControl: boolean
}

interface UTAStatus {
	id: number
	name?: string
	reasons: string[]
}

async function main() {
	const {data} = await axios.get<XivapiResponse<XivapiStatus>>('https://v2.xivapi.com/api/search?sheets=Status&query=LockActions=1 LockControl=1&fields=LockActions,LockControl,Name&limit=500')

	if (data.next != null) {
		throw new Error('too many results, pagination needs to be handled')
	}

	// Build the list of statuses that imply inability to act
	const utaStatuses: UTAStatus[] = []
	for (const status of data.results) {
		if (!status.fields.LockActions && !status.fields.LockControl) {
			continue
		}

		utaStatuses.push({
			id: status.row_id,
			name: status.fields.Name,
			reasons: [
				...status.fields.LockActions ? ['lockActions'] : [],
				...status.fields.LockControl ? ['lockControl'] : [],
			],
		})
	}

	// The secondary effect from Moon Flute, Waning Nocturne, makes you
	// unable to do any actions (save, for some reason, Sprint) for 15 seconds.
	// Sadly the game doesn't mark it as LockActions.
	// Just tagging it manually here saves a lot of hassle later:
	utaStatuses.push({
		id: 1727,
		name: 'Waning Nocturne',
		reasons: [
			'lockActions',
		],
	})

	utaStatuses.sort((a, b) => a.id - b.id)

	// Codegen
	const statusLines = utaStatuses
		.map(meta => `\t${meta.id}, // ${meta.name ?? ''} (${meta.reasons.join(', ')})`)
	const fileContents = `/* eslint-disable */
// This file is automatically generated. Do not edit.
// If you wish to regenerate, run \`pnpm run generate\`.
export const UNABLE_TO_ACT_STATUS_IDS = [
${statusLines.join('\n')}
]
`

	fs.writeFileSync('./src/generated/unableToActStatusIds.ts', fileContents)
}
