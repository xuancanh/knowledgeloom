/**
 * ImportPage — standalone /import route wrapper around ImportPanel.
 *
 * The import form itself lives in ImportPanel (also embedded as a tab in the
 * Capture box on Home). This page keeps the old /import deep link working with
 * a full-page header.
 */
import ImportPanel from './ImportPanel';
import { useTranslation } from 'react-i18next';

export default function ImportPage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="today-page import-page">
      <header className="today-head">
        <h1>{t('importFlow.title')}</h1>
      </header>
      <ImportPanel onOpenNote={onOpenNote} />
    </div>
  );
}
