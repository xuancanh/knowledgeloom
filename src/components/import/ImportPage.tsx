/**
 * ImportPage — standalone /import route wrapper around ImportPanel.
 *
 * The import form itself lives in ImportPanel (also embedded as a tab in the
 * Capture box on Home). This page keeps the old /import deep link working with
 * a full-page header.
 */
import ImportPanel from './ImportPanel';

export default function ImportPage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  return (
    <div className="today-page import-page">
      <header className="today-head">
        <h1>Import</h1>
        <p className="import-sub">Turn a PDF, lecture recording, photo of handwritten notes, or pasted text into a knowledge note — flashcards and quiz questions follow automatically.</p>
      </header>
      <ImportPanel onOpenNote={onOpenNote} />
    </div>
  );
}
