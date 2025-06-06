import {changelog} from './changelog'
import {Meta} from './Meta'

// eslint-disable-next-line no-constant-binary-expression
const DEBUG_IS_APRIL_FIRST: boolean = false && process.env.NODE_ENV !== 'production'
const JS_APRIL_MONTH: number = 3 // JS months start at 0 because reasons

export const CORE = new Meta({
	modules: () => import('./modules' /* webpackChunkName: "core" */),
	Description: getIsAprilFirst()
		? AprilFoolsDescription
		: undefined,
	changelog,

	// Read `docs/patch-checklist.md` before editing the following values.
	supportedPatches: {
		from: '7.0',
		to: '7.2',
	},
})

export function getIsAprilFirst(): boolean {
	if (DEBUG_IS_APRIL_FIRST) { return true }
	const currentDate: Date = new Date()
	return currentDate.getDate() === 1 && currentDate.getMonth() === JS_APRIL_MONTH
}

function AprilFoolsDescription() {
	return <>
		<div style={{
			display: 'flex',
			alignItems: 'center',
			marginBottom: '10px',
		}}>
			<img
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				src={require('../../data/avatar/Clippy.png')}
				style={{width: '60px', marginRight: '1.5em'}}
			/>
			<div>
				You look like you're trying to play FFXIV! Would you like some help?
			</div>
		</div>
	</>
}
