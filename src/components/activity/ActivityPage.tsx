import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LearnJob, SearchStatus } from '../../types';
import { jobState } from '../../lib/view';
import { formatJobDate } from '../../lib/format';
import styles from './ActivityPage.module.css';

/** Filter tabs for the job activity page. */
type Filter = 'all' | 'active' | 'done' | 'failed';

export default function ActivityPage({
  jobs,
  searchStatus,
  onOpenNote,
}: {
  jobs: LearnJob[];
  searchStatus?: SearchStatus;
  onOpenNote: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = [...jobs].sort((a, b) => {
    const ta = a.createdAt ?? '';
    const tb = b.createdAt ?? '';
    return tb.localeCompare(ta);
  });

  const activeJobs  = sorted.filter((j) => j.status === 'queued' || j.status === 'running');
  const doneJobs    = sorted.filter((j) => j.status === 'done');
  const failedJobs  = sorted.filter((j) => j.status === 'error');

  const visible = filter === 'active' ? activeJobs
    : filter === 'done'   ? doneJobs
    : filter === 'failed' ? failedJobs
    : sorted;

  const filters: { key: Filter; label: string }[] = [
    { key: 'all',    label: t('activity.tabAll', { count: sorted.length }) },
    { key: 'active', label: t('activity.tabActive', { count: activeJobs.length }) },
    { key: 'done',   label: t('activity.tabDone', { count: doneJobs.length }) },
    { key: 'failed', label: t('activity.tabFailed', { count: failedJobs.length }) },
  ];

  return (
    <div className={styles.page}>
      <div className="crumbs"><span>{t('common.desk')}</span><span className="sep">/</span><span>{t('activity.title')}</span></div>

      <div className={styles.head}>
        <div className={styles.headText}>
          <h1>{t('activity.title')}</h1>
          <p>{t('activity.description')}</p>
        </div>
        <div className={styles.headStats}>
          <div className={`${styles.statBadge} ${styles.active}`}>
            <b>{activeJobs.length}</b>
            <span>{t('activity.active')}</span>
          </div>
          <div className={`${styles.statBadge} ${styles.done}`}>
            <b>{doneJobs.length}</b>
            <span>{t('activity.done')}</span>
          </div>
          {failedJobs.length > 0 && (
            <div className={`${styles.statBadge} ${styles.failed}`}>
              <b>{failedJobs.length}</b>
              <span>{t('activity.failed')}</span>
            </div>
          )}
        </div>
      </div>

      {searchStatus?.state === 'degraded' && (
        <div className={styles.searchWarning} role="status">
          <strong>{t('activity.searchDegradedTitle')}</strong>
          <span>{t('activity.searchDegradedBody', { engine: searchStatus.engine })}</span>
        </div>
      )}

      <div className={styles.filters}>
        {filters.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.filterBtn}${filter === key ? ` ${styles.active}` : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          {filter === 'all' ? t('activity.noJobs') : t('activity.noJobsFilter', { filter })}
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((job) => {
            const state = jobState(job);
            const canOpen = Boolean(job.note?.id);
            const ts = job.finishedAt || job.startedAt || job.createdAt;
            return (
              <article key={job.id} className={`${styles.job} ${styles[state]}`}>
                <div className={styles.jobMeta}>
                  <span className={styles.jobState}>
                    <span className={styles.pulse} />
                    {state === 'researching' ? t('activity.running') : state.charAt(0).toUpperCase() + state.slice(1)}
                  </span>
                  <span className={styles.jobDot} />
                  <span className={styles.jobTime}>{formatJobDate(ts)}</span>
                  {job.category && <span className={styles.jobCat}>{job.category}</span>}
                </div>
                <button
                  className={styles.jobTitle}
                  disabled={!canOpen}
                  onClick={() => job.note?.id && onOpenNote(job.note.id)}
                >
                  {job.topic}
                </button>
                {job.error && <p className={styles.jobError}>{job.error}</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
