import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';

// Errors that indicate the backend is cold-starting (Render free tier).
// In these cases we auto-retry with a countdown instead of showing a hard error.
const isColdStartError = (msg) => {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('not found') ||        // Render splash returns 404 for API paths
    m.includes('load failed') ||
    m.includes('err_connection_reset')
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // warmingUp = true while we're auto-retrying a cold-start failure
  const [warmingUp, setWarmingUp] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const navigate = useNavigate();
  const { login } = useAuth();
  const retryRef = useRef(null); // holds { timer, credentials, attempt }

  // Clean up any pending retry timers on unmount.
  useEffect(() => () => {
    if (retryRef.current?.timer) clearInterval(retryRef.current.timer);
  }, []);

  const attemptLogin = async (emailVal, passwordVal) => {
    try {
      await login(emailVal, passwordVal);
      navigate('/dashboard');
      return true;
    } catch (err) {
      return { err };
    }
  };

  const scheduleRetry = (emailVal, passwordVal, attempt) => {
    // Backoff: 15s, 20s, 25s … capped at 40s. Max 6 auto-retries then give up.
    const MAX_AUTO_RETRIES = 6;
    if (attempt > MAX_AUTO_RETRIES) {
      setWarmingUp(false);
      setLoading(false);
      setError('Backend is taking longer than expected to start. Please wait a moment and try again manually.');
      return;
    }
    const wait = Math.min(15 + (attempt - 1) * 5, 40);
    setRetryCountdown(wait);

    let remaining = wait;
    const iv = setInterval(() => {
      remaining -= 1;
      setRetryCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        retryRef.current = null;
        // Retry the login
        attemptLogin(emailVal, passwordVal).then((result) => {
          if (result === true) return; // success — navigation already happened
          const { err } = result;
          if (isColdStartError(err?.message)) {
            scheduleRetry(emailVal, passwordVal, attempt + 1);
          } else {
            setWarmingUp(false);
            setLoading(false);
            setError(err?.message || 'Login failed');
          }
        });
      }
    }, 1000);
    retryRef.current = { timer: iv };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setWarmingUp(false);
    const result = await attemptLogin(email, password);
    if (result === true) return; // navigated away
    const { err } = result;
    if (isColdStartError(err?.message)) {
      setWarmingUp(true);
      scheduleRetry(email, password, 1);
    } else {
      setError(err?.message || 'Login failed');
      setLoading(false);
    }
  };

  const cancelRetry = () => {
    if (retryRef.current?.timer) clearInterval(retryRef.current.timer);
    retryRef.current = null;
    setWarmingUp(false);
    setLoading(false);
    setRetryCountdown(0);
  };

  return (
    <div style={{
      background: '#fbf9f8', minHeight: '100vh', display: 'flex',
      fontFamily: 'Manrope',
    }}>
      {/* Left: Branding */}
      <div style={{
        width: '50%', background: '#F5F1EA', display: 'flex', flexDirection: 'column',
        padding: '48px', position: 'relative', justifyContent: 'center',
      }}>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1b3022', letterSpacing: '-0.02em' }}>IncidentOps</span>
        </div>
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '48px 0', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Abstract illustration */}
          <svg viewBox="0 0 400 300" style={{ width: '100%', opacity: 0.85 }}>
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1b3022" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#944a04" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            {/* Abstract dashboard shape */}
            <rect x="20" y="20" width="360" height="260" rx="12" fill="#fff" stroke="#c3c8c1" strokeWidth="1" />
            <rect x="20" y="20" width="360" height="48" rx="12" fill="#1b3022" />
            <rect x="20" y="56" width="360" height="12" fill="#1b3022" />
            <circle cx="48" cy="44" r="8" fill="rgba(255,255,255,0.3)" />
            <circle cx="72" cy="44" r="8" fill="rgba(255,255,255,0.3)" />
            <circle cx="96" cy="44" r="8" fill="rgba(255,255,255,0.3)" />
            <text x="40" y="100" fill="#434843" fontSize="10" fontFamily="Manrope">Time</text>
            <text x="110" y="100" fill="#434843" fontSize="10" fontFamily="Manrope">Source</text>
            <text x="210" y="100" fill="#434843" fontSize="10" fontFamily="Manrope">Level</text>
            <text x="280" y="100" fill="#434843" fontSize="10" fontFamily="Manrope">Message</text>
            <line x1="20" y1="108" x2="380" y2="108" stroke="#c3c8c1" strokeWidth="0.5" />
            {[120, 136, 152, 168, 184, 200].map((y, i) => (
              <g key={i}>
                <rect x="20" y={y} width="360" height="16" fill={i % 2 ? 'rgba(195,200,193,0.1)' : 'transparent'} />
                <rect x="240" y={y+3} width={i===1||i===3?36:48} height="10" rx="2" fill={i===0||i===4?'rgba(91,10,0,0.15)':(i===1||i===3?'rgba(148,74,4,0.15)':'rgba(27,48,34,0.15)')} />
                <text x="250" y={y+11} fill={i===0||i===4?'#5b0a00':(i===1||i===3?'#944a04':'#1b3022')} fontSize="7" fontFamily="JetBrains Mono">
                  {i===0||i===4?'ERROR':(i===1||i===3?'WARN':'INFO')}
                </text>
              </g>
            ))}
            {/* Spike indicator */}
            <polyline points="30,270 70,265 110,268 150,260 190,255 230,240 270,180 310,140 350,160" fill="none" stroke="#1b3022" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="270" cy="180" r="5" fill="#944a04" />
          </svg>
        </div>
        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1b3022', lineHeight: '40px', letterSpacing: '-0.02em' }}>
            Real-time visibility into every incident.
          </h1>
        </div>
      </div>

      {/* Right: Login Form */}
      <div style={{
        width: '50%', background: '#fbf9f8', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '24px',
        minHeight: '100vh', position: 'relative',
      }}>
        <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 48 }}>
          {/* Header */}
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#1b3022', letterSpacing: '-0.02em' }}>Welcome back</h2>
            <p style={{ fontSize: 16, fontWeight: 400, color: '#434843', opacity: 0.8 }}>Sign in to your IncidentOps dashboard.</p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex', flexDirection: 'column', gap: 24,
              background: '#fff', padding: 24, borderRadius: 16,
              boxShadow: '0px 4px 20px rgba(27,58,43,0.04)',
              border: '1px solid rgba(195,200,193,0.3)',
            }}
          >
            {/* Status / Error messages */}
            {warmingUp && (
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#92400e', padding: '12px 14px', borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>☕</span>
                  Backend is waking up (Render cold start)…
                </div>
                <div style={{ opacity: 0.8 }}>
                  Retrying automatically in <strong>{retryCountdown}s</strong>. This usually takes 30–60 seconds.
                </div>
                <button
                  type="button"
                  onClick={cancelRetry}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#92400e', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}
                >
                  Cancel and try manually
                </button>
              </div>
            )}
            {error && !warmingUp && (
              <div style={{ background: '#FBEAE9', color: '#901201', padding: '12px', borderRadius: 8, fontSize: 14 }}>
                {error}
              </div>
            )}
            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="email" style={{ fontSize: 14, fontWeight: 600, color: '#1b3022', letterSpacing: '0.02em' }}>Email</label>
              <input
                id="email" type="email" name="email" placeholder="name@company.com" required
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%', background: '#fbf9f8', border: '1px solid rgba(115,121,115,0.3)',
                  borderRadius: 8, padding: '12px 16px', fontSize: 16, color: '#1b1c18',
                  outline: 'none', fontFamily: 'Manrope', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="password" style={{ fontSize: 14, fontWeight: 600, color: '#1b3022', letterSpacing: '0.02em' }}>Password</label>
                <a href="#" style={{ fontSize: 12, fontWeight: 500, color: '#434843', textDecoration: 'none' }}>Forgot password?</a>
              </div>
              <input
                id="password" type="password" name="password" placeholder="••••••••" required
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%', background: '#fbf9f8', border: '1px solid rgba(115,121,115,0.3)',
                  borderRadius: 8, padding: '12px 16px', fontSize: 16, color: '#1b1c18',
                  outline: 'none', fontFamily: 'Manrope', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* Submit */}
            <button type="submit" disabled={loading || warmingUp} style={{
              width: '100%', background: (loading || warmingUp) ? '#434843' : '#1b3022', color: '#fff', fontWeight: 600,
              fontSize: 14, letterSpacing: '0.02em', borderRadius: 8, padding: '16px',
              border: 'none', cursor: (loading || warmingUp) ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center',
              alignItems: 'center', gap: 8, fontFamily: 'Manrope',
              transition: 'background 0.2s',
            }}>
              {warmingUp ? `Waking up backend… (${retryCountdown}s)` : loading ? 'Logging in...' : 'Log In'}
              <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.7 }}>arrow_forward</span>
            </button>
          </form>

          <div>
            <p style={{ fontSize: 14, color: '#434843', opacity: 0.7 }}>Contact your administrator for access.</p>
          </div>
        </div>

        <footer style={{ position: 'fixed', bottom: 24, right: 24, textAlign: 'right', zIndex: 50 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#434843', opacity: 0.5 }}>IncidentOps © 2024 v2.4.0-stable</p>
        </footer>
      </div>
    </div>
  );
}
