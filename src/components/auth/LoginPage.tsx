import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import styles from './LoginPage.module.css';

type Mode = 'sign-in' | 'sign-up' | 'magic-link' | 'magic-sent';

export function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Pre-fill email if the user typed it on the landing page
  useEffect(() => {
    const draft = sessionStorage.getItem('kl:landing-draft');
    if (draft && draft.includes('@') && !draft.includes(' ')) {
      setEmail(draft);
    }
  }, []);

  const clearError = () => setError('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'magic-link') {
        const { error: err } = await supabase.auth.signInWithOtp({ email });
        if (err) throw err;
        setMode('magic-sent');
        return;
      }

      if (mode === 'sign-up') {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // Supabase may confirm immediately or require email verification
        navigate('/home');
        return;
      }

      // sign-in
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      navigate('/home');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, navigate]);

  if (mode === 'magic-sent') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.sent}>
            <div className={styles.sentIcon}>✉</div>
            <h1 className={styles.sentTitle}>{t('auth.checkInbox')}</h1>
            <p className={styles.sentDesc} dangerouslySetInnerHTML={{ __html: t('auth.magicLinkSent', { email }) }} />
            <button className={styles.linkBtn} onClick={() => setMode('magic-link')}>
              {t('auth.resendLink')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.navBrand}>
          <span className={styles.navBrandDot} />
          {t('auth.appName')}
        </Link>
      </nav>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardTitle}>
            {mode === 'sign-up' ? t('auth.createAccount') : t('auth.welcomeBack')}
          </h1>
          <p className={styles.cardSub}>
            {mode === 'sign-up' ? t('auth.signUpTagline') : t('auth.signInTagline')}
          </p>
        </div>

        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${mode === 'sign-in' ? styles.modeTabActive : ''}`}
            onClick={() => { setMode('sign-in'); clearError(); }}
          >
            {t('auth.signIn')}
          </button>
          <button
            className={`${styles.modeTab} ${mode === 'sign-up' ? styles.modeTabActive : ''}`}
            onClick={() => { setMode('sign-up'); clearError(); }}
          >
            {t('auth.signUp')}
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">{t('auth.emailLabel')}</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          {mode !== 'magic-link' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">{t('auth.passwordLabel')}</label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder={mode === 'sign-up' ? t('auth.passwordPlaceholder') : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                required
                disabled={loading}
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading || !email}>
            {loading
              ? t('auth.pleaseWait')
              : mode === 'sign-up'
              ? t('auth.createAccount')
              : mode === 'magic-link'
              ? t('auth.sendMagicLink')
              : t('auth.signIn')}
          </button>
        </form>

        <div className={styles.divider}><span>{t('auth.or')}</span></div>

        <button
          className={styles.magicBtn}
          onClick={() => { setMode(mode === 'magic-link' ? 'sign-in' : 'magic-link'); clearError(); }}
          disabled={loading}
        >
          {mode === 'magic-link' ? t('auth.usePasswordInstead') : t('auth.signInMagicLink')}
        </button>
      </div>
    </div>
  );
}
