import type { LearnJob } from '../types';
import { formatJobTime, jobState } from '../lib/view';

/**
 * Dedicated Codex work queue page. The left rail links here with the active
 * count, while this page keeps full job history and retry context out of the
 * capture-focused home page.
 */
export default function ActivityPage({
  jobs,
  onOpenNote,
}: {
  jobs: LearnJob[];
  onOpenNote: (id: string) => void;
}) {
  const inFlight = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const completed = jobs.filter((job) => job.status !== 'queued' && job.status !== 'running');

  return (
    <div className="activity-page">
      <div className="crumbs"><span>Desk</span><span className="sep">/</span><span>Activity</span></div>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>Queued and running Codex requests resume after server restart. Completed requests stay here as history.</p>
        </div>
        <div className="activity-count">
          <b>{inFlight.length}</b>
          <span>in flight</span>
        </div>
      </div>

      <section>
        <div className="section-label">
          <h2>In flight</h2>
          <span className="meta">{inFlight.length} active</span>
        </div>
        <JobList jobs={inFlight} onOpenNote={onOpenNote} empty="No queued or running Codex requests." />
      </section>

      <section>
        <div className="section-label">
          <h2>History</h2>
          <span className="meta">{completed.length} finished</span>
        </div>
        <JobList jobs={completed} onOpenNote={onOpenNote} empty="No completed jobs yet." />
      </section>
    </div>
  );
}

/**
 * Renders a compact, scannable job list. Saved jobs with a linked note are
 * clickable; queued/running/failed jobs stay as status records.
 */
function JobList({
  jobs,
  onOpenNote,
  empty,
}: {
  jobs: LearnJob[];
  onOpenNote: (id: string) => void;
  empty: string;
}) {
  if (!jobs.length) return <div className="empty">{empty}</div>;
  return (
    <div className="activity-job-list">
      {jobs.map((job) => {
        const state = jobState(job);
        const canOpen = Boolean(job.note?.id);
        return (
          <article key={job.id} className={`job ${state}`}>
            <div className="top">
              <span className="state"><span className="pulse" />{state}</span>
              <span>· {formatJobTime(job.startedAt || job.createdAt)}</span>
              <span>· attempt {job.attempts || 0}/{job.maxAttempts || 0}</span>
              <span className="job-id">· {job.id}</span>
            </div>
            <button className="title" disabled={!canOpen} onClick={() => job.note?.id && onOpenNote(job.note.id)}>
              {job.topic}
            </button>
            {job.error && <p className="job-error">{job.error}</p>}
          </article>
        );
      })}
    </div>
  );
}
