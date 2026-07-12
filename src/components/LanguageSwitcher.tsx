import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'fr', label: 'Français' },
  { code: 'hi', label: 'हिन्दी' },
];

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();

  const handleChange = (code: string) => void changeLanguage(code);

  if (compact) {
    return (
      <select
        className="lang-switcher-select"
        value={i18n.language}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={t('settings.language')}
      >
        {LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="lang-switcher">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          className={`lang-btn${i18n.language === code ? ' active' : ''}`}
          onClick={() => handleChange(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
