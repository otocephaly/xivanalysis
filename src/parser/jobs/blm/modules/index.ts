import {Interrupts} from 'parser/core/modules/Interrupts'
import {Tincture} from 'parser/core/modules/Tincture'
import {ActionTimeline} from './ActionTimeline'
import {AoEUsages} from './AoEUsages'
import {CastTime} from './CastTime'
import {Defensives} from './Defensives'
import {DoTs} from './DoTs'
import {Gauge} from './Gauge'
import {Leylines} from './Leylines'
import {NotCasting} from './NotCasting'
import {OGCDDowntime} from './OGCDDowntime'
import {Procs} from './Procs'
import {RotationWatchdog} from './RotationWatchdog'
import {Thunder} from './Thunder'
import {Triplecast} from './Triplecast'
import {Weaving} from './Weaving'

export const modules = [
	ActionTimeline,
	AoEUsages,
	Weaving,
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
	DoTs,
	Thunder,
	Triplecast,
]
