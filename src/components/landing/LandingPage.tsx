import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css';

const FEATURES = [
  {
    icon: '✦',
    name: 'Capture anything, instantly',
    desc: 'Drop a URL, paste a draft, or speak a rough idea. AI shapes it into a structured, searchable note.',
  },
  {
    icon: '◎',
    name: 'Ask your knowledge base',
    desc: 'Chat with your notes. Ask questions across your entire vault or zoom into one category or tag.',
  },
  {
    icon: '⟁',
    name: 'Spaced-repetition flashcards',
    desc: 'Every note automatically becomes a deck. Review what you need to, when you need to.',
  },
  {
    icon: '⊡',
    name: 'Focus mode for deep work',
    desc: 'Distraction-free reading with adjustable font size and width. Write in the editor, think in the reader.',
  },
  {
    icon: '⌕',
    name: 'Full-text search',
    desc: 'Instant results across titles, summaries, tags, and body text — powered by Meilisearch.',
  },
  {
    icon: '⬡',
    name: 'Knowledge graph',
    desc: 'See how your ideas connect. Backlinks and outgoing links visualised in a radial graph per note.',
  },
];

export function LandingPage() {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();

  const handleCapture = useCallback(() => {
    if (!draft.trim()) {
      navigate('/login');
      return;
    }
    // Pre-fill capture and redirect to login/signup with draft preserved in session storage
    sessionStorage.setItem('kl:landing-draft', draft.trim());
    navigate('/login');
  }, [draft, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCapture();
    }
  }, [handleCapture]);

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <span className={styles.navBrand}>
          <span className={styles.navBrandDot} />
          Knowledge Loom
        </span>
        <div className={styles.navActions}>
          <Link to="/login" className={styles.navLink}>Sign in</Link>
          <Link to="/login" className={styles.navCta}>Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <span className={styles.heroEyebrowDot} />
          Your AI-powered second brain
        </div>
        <h1 className={styles.heroTitle}>
          Capture the thought<br />
          <em>before it disappears</em>
        </h1>
        <p className={styles.heroSub}>
          Drop an idea, a URL, or a rough draft. AI structures it, connects it, and makes it retrievable — forever.
        </p>

        {/* Inline capture — the magic moment */}
        <div className={styles.heroCapture}>
          <div className={styles.heroCaptureLabel}>✦ New thought</div>
          <textarea
            className={styles.heroCaptureInput}
            placeholder="What did you just learn? Paste a URL, type a thought, or describe what you want to remember…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          <div className={styles.heroCaptureFooter}>
            <span className={styles.heroCaptureHint}>
              {draft.trim() ? '⌘↵ to capture' : 'No account needed to try'}
            </span>
            <button className={styles.heroCaptureBtn} onClick={handleCapture}>
              {draft.trim() ? 'Capture →' : 'Start free →'}
            </button>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <div className={styles.proof}>
        <p className={styles.proofText}>
          <strong>Local-first.</strong> Your notes are markdown files on your own disk — or S3.&nbsp;
          <strong>No vendor lock-in.</strong> Export anytime.&nbsp;
          <strong>Open source.</strong>
        </p>
      </div>

      {/* Features */}
      <section className={styles.features}>
        <h2 className={styles.featuresTitle}>Everything you need to think better</h2>
        <p className={styles.featuresSub}>
          From capture to recall — one tool, no context switching.
        </p>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.name} className={styles.featureCard}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3 className={styles.featureName}>{f.name}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className={styles.how}>
        <div className={styles.howInner}>
          <h2 className={styles.howTitle}>From idea to insight in three steps</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNum}>1</div>
              <h3 className={styles.stepTitle}>Capture</h3>
              <p className={styles.stepDesc}>
                Drop anything — a rough idea, a URL, a draft, or a topic. AI writes the note for you.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>2</div>
              <h3 className={styles.stepTitle}>Connect</h3>
              <p className={styles.stepDesc}>
                Notes link to each other automatically. Explore connections through the knowledge graph.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>3</div>
              <h3 className={styles.stepTitle}>Recall</h3>
              <p className={styles.stepDesc}>
                Ask questions in natural language. Study with spaced-repetition flashcards. Remember more.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Start capturing today</h2>
        <p className={styles.ctaSub}>
          Free to use. Your data stays yours. Set up in under two minutes.
        </p>
        <Link to="/login" className={styles.ctaBtn}>
          Get started — it's free
        </Link>
        <p className={styles.ctaNote}>No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerCopy}>© {new Date().getFullYear()} Knowledge Loom</span>
        <div className={styles.footerLinks}>
          <a href="https://github.com/anthropics/claude-code/issues" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>Feedback</a>
        </div>
      </footer>
    </div>
  );
}
