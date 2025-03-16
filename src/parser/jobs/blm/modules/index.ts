import {Interrupts} from 'parser/core/modules/Interrupts'
import {Tincture} from 'parser/core/modules/Tincture'
import {ActionTimeline} from './ActionTimeline'
import {AlwaysBeCasting} from './AlwaysBeCasting'
import {AoEUsages} from './AoEUsages'
import {CastTime} from './CastTime'
import {Defensives} from './Defensives'
import {Gauge} from './Gauge'
import {Leylines} from './Leylines'
import {NotCasting} from './NotCasting'
import {OGCDDowntime} from './OGCDDowntime'
import {Procs} from './Procs'
import {RotationWatchdog} from './RotationWatchdog'
import {Thunder} from './Thunder'
import {Triplecast} from './Triplecast'

export const modules = [
	ActionTimeline,
	AoEUsages,
	AlwaysBeCasting,
	CastTime,
	Defensives,
	Gauge,
	Interrupts,
	Tincture,
	Leylines,
	NotCasting,
	OGCDDowntime,
	Procs,
	RotationWatchdog,
	Thunder,
	Triplecast,
]
