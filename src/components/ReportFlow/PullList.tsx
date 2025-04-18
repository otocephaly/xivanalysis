import {Trans} from '@lingui/react'
import classNames from 'classnames'
import {getDutyBanner} from 'data/ENCOUNTERS'
import {observer} from 'mobx-react'
import {useContext, useCallback, Key} from 'react'
import {Link} from 'react-router-dom'
import {Duty, Pull} from 'report'
import {ReportStore} from 'reportSources'
import {Checkbox, Icon, CheckboxProps} from 'semantic-ui-react'
import {StoreContext} from 'store'
import {formatDuration} from 'utilities'
import styles from './ReportFlow.module.css'

const TRASH_DUTY: Duty = {
	id: -1,
	name: 'Trash',
}

interface PullGroupData {
	duty: Duty
	pulls: Pull[]
	key: Key
}

export interface PullListProps {
	reportStore: ReportStore
}

export const PullList = observer(function PullList({reportStore}: PullListProps) {
	const {settingsStore} = useContext(StoreContext)

	const onToggleKillsOnly = useCallback(
		(_, data: CheckboxProps) =>
			settingsStore.setViewKillsOnly(data.checked ?? false),
		[settingsStore],
	)

	const onRefresh = useCallback(
		() => reportStore.requestPulls({bypassCache: true}),
		[reportStore],
	)

	if (reportStore.report == null) {
		return null
	}

	// Ensure pulls are up to date
	reportStore.requestPulls()

	// Group encounters by the duty they took place in
	// We're maintaining chronological order, so only tracking the latest duty
	const groups: PullGroupData[] = []
	let currentDuty: Duty['id'] | undefined

	const trashPulls: PullGroupData = {
		duty: TRASH_DUTY,
		pulls: [],
		key: 'trash',
	}

	for (const pull of reportStore.report.pulls) {
		if (pull.encounter.key === 'TRASH') {
			trashPulls.pulls.push(pull)
			continue
		}

		const {duty} = pull.encounter
		if (duty.id !== currentDuty) {
			groups.push({duty, pulls: [], key: pull.id})
			currentDuty = duty.id
		}

		if (settingsStore.killsOnly && (pull.progress ?? 0) < 100) {
			continue
		}

		groups[groups.length - 1].pulls.push(pull)
	}

	if (!settingsStore.killsOnly) {
		groups.push(trashPulls)
	}

	const filteredGroups = groups.filter(group => group.pulls.length > 0)

	return (
		<div className={styles.pullList}>
			<div className={styles.controls}>
				<Checkbox
					label={(
						<label>
							<Trans id="core.report-flow.kills-only">Kills only</Trans>
						</label>
					)}
					checked={settingsStore.killsOnly}
					onChange={onToggleKillsOnly}
				/>
				<button className={styles.refresh} onClick={onRefresh}>
					<Icon name="refresh"/>
					<Trans id="core.report-flow.refresh">Refresh</Trans>
				</button>
			</div>

			{filteredGroups.map(group => <PullGroup key={group.key} group={group}/>)}
		</div>
	)
})

interface PullGroupProps {
	group: PullGroupData
}

const PullGroup = ({group}: PullGroupProps) => (
	<div className={styles.group}>
		<div className={styles.groupHeader}>
			{group.duty.id > 0 && (
				<div
					className={styles.banner}
					style={{backgroundImage: `url(${getDutyBanner(group.duty.id)})`}}
				/>
			)}
			<h2>{group.duty.name}</h2>
		</div>

		<div className={styles.links}>
			{group.pulls.map(pull => <PullLink key={pull.id} pull={pull}/>)}
		</div>
	</div>
)

interface PullLinkProps {
	pull: Pull
}

function PullLink({pull}: PullLinkProps) {
	return (
		<Link
			to={pull.id}
			className={styles.link}
		>
			<span className={styles.text}>
				{pull.encounter.name}
			</span>

			<span className={styles.meta}>
				{formatDuration(pull.duration)}
			</span>

			{pull.progress != null && (
				<div className={styles.progress}>
					<div
						className={classNames(
							styles.progressBar,
							pull.progress >= 100 && styles.success,
						)}
						style={{width: `${pull.progress}%`}}
					/>
				</div>
			)}
		</Link>
	)
}
