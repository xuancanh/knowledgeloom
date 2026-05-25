import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import styles from './LoginPage.module.css';

type Mode = 'sign-in' | 'sign-up' | 'magic-link' | 'magic-sent';

export function LoginPage() {
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
            <h1 className={styles.sentTitle}>Check your inbox</h1>
            <p className={styles.sentDesc}>
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <button className={styles.linkBtn} onClick={() => setMode('magic-link')}>
              Resend link
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
          Knowledge Loom
        </Link>
      </nav>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardTitle}>
            {mode === 'sign-up' ? 'Create account' : 'Welcome back'}
          </h1>
          <p className={styles.cardSub}>
            {mode === 'sign-up'
              ? 'Your second brain starts here.'
              : 'Sign in to your knowledge base.'}
          </p>
        </div>

        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${mode === 'sign-in' ? styles.modeTabActive : ''}`}
            onClick={() => { setMode('sign-in'); clearError(); }}
          >
            Sign in
          </button>
          <button
            className={`${styles.modeTab} ${mode === 'sign-up' ? styles.modeTabActive : ''}`}
            onClick={() => { setMode('sign-up'); clearError(); }}
          >
            Sign up
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          {mode !== 'magic-link' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder={mode === 'sign-up' ? 'At least 8 characters' : ''}
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
              ? 'Please wait…'
              : mode === 'sign-up'
              ? 'Create account'
              : mode === 'magic-link'
              ? 'Send magic link'
              : 'Sign in'}
          </button>
        </form>

        <div className={styles.divider}><span>or</span></div>

        <button
          className={styles.magicBtn}
          onClick={() => { setMode(mode === 'magic-link' ? 'sign-in' : 'magic-link'); clearError(); }}
          disabled={loading}
        >
          {mode === 'magic-link' ? '← Use password instead' : '✉ Sign in with magic link'}
        </button>
      </div>
    </div>
  );
}
