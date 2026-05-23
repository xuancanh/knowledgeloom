import { useState } from 'react';
import type { LearnJob } from '../../types';
import { jobState } from '../../lib/view';
import { formatJobDate } from '../../lib/format';
import styles from './ActivityPage.module.css';

/** Filter tabs for the job activity page. */
type Filter = 'all' | 'active' | 'done' | 'failed';

export default function ActivityPage({
  jobs,
  onOpenNote,
}: {
  jobs: LearnJob[];
  onOpenNote: (id: string) => void;
}) {
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
    { key: 'all',    label: `All · ${sorted.length}` },
    { key: 'active', label: `Active · ${activeJobs.length}` },
    { key: 'done',   label: `Done · ${doneJobs.length}` },
    { key: 'failed', label: `Failed · ${failedJobs.length}` },
  ];

  return (
    <div className={styles.page}>
      <div className="crumbs"><span>Desk</span><span className="sep">/</span><span>Activity</span></div>

      <div className={styles.head}>
        <div className={styles.headText}>
          <h1>Activity</h1>
          <p>Queued and running Codex requests resume after server restart. Completed jobs stay here as a permanent record.</p>
        </div>
        <div className={styles.headStats}>
          <div className={`${styles.statBadge} ${styles.active}`}>
            <b>{activeJobs.length}</b>
            <span>active</span>
          </div>
          <div className={`${styles.statBadge} ${styles.done}`}>
            <b>{doneJobs.length}</b>
            <span>done</span>
          </div>
          {failedJobs.length > 0 && (
            <div className={`${styles.statBadge} ${styles.failed}`}>
              <b>{failedJobs.length}</b>
              <span>failed</span>
            </div>
          )}
        </div>
      </div>

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
          {filter === 'all' ? 'No jobs yet.' : `No ${filter} jobs.`}
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
                    {state === 'researching' ? 'Running' : state.charAt(0).toUpperCase() + state.slice(1)}
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
