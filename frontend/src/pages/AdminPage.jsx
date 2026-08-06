import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

// Field definitions for the Alert Thresholds form — mirrors the worker's
// three detection rules (ThresholdsUpdate schema on the backend).
const THRESHOLD_FIELDS = [
  { key: 'error_rate_threshold', label: 'Error Rate Threshold', suffix: '%', step: 0.5, min: 0.1, max: 100,
    hint: 'error_rate_spike fires when the error rate in a 60s window exceeds this.' },
  { key: 'error_rate_min_total', label: 'Min Log Count', suffix: '', step: 1, min: 1, max: 10000,
    hint: 'Minimum logs required in the 60s window before error_rate_spike can fire.' },
  { key: 'latency_multiplier', label: 'Latency Multiplier', suffix: '×', step: 0.1, min: 1.1, max: 50,
    hint: 'latency_spike fires when avg response time exceeds N× the 24h baseline.' },
  { key: 'burst_error_threshold', label: 'Burst Error Count', suffix: '', step: 1, min: 1, max: 1000,
    hint: 'failure_burst fires at N or more ERROR logs from one source within 30s.' },
];

// JWTs are signed, not encrypted — decoding the payload client-side to read
// claims for display is safe; it does not verify the token.
const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const formatExpiry = (exp) => {
  if (!exp) return '—';
  return new Date(exp * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export default function AdminPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const { collapsed } = useNav();
  const navWidth = collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED;

  const claims = token ? decodeJwtPayload(token) : null;
  const email = claims?.sub ?? 'unknown';

  // Alert thresholds — loaded from the backend, edited as a draft form, saved on demand.
  const [thresholds, setThresholds] = useState(null); // last-saved values from the server
  const [form, setForm] = useState(null);              // editable draft
  const [status, setStatus] = useState('loading');     // loading | ready | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getThresholds(token)
      .then(data => {
        if (cancelled) return;
        setThresholds(data);
        setForm(data);
        setStatus('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setErrorMsg(err.message || 'Failed to load thresholds');
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [token]);

  const isValid = form && THRESHOLD_FIELDS.every(f => form[f.key] !== '' && !Number.isNaN(Number(form[f.key])));
  const isDirty = thresholds && form && THRESHOLD_FIELDS.some(f => Number(form[f.key]) !== Number(thresholds[f.key]));

  const handleFieldChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveThresholds = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const payload = Object.fromEntries(THRESHOLD_FIELDS.map(f => [f.key, Number(form[f.key])]));
      const updated = await api.updateThresholds(payload, token);
      setThresholds(updated);
      setForm(updated);
      setStatus('saved');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save thresholds');
      setStatus('error');
    }
  };

  const panelStyle = {
    background: 'var(--panel-bg)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 10,
    boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -14px rgba(0,0,0,0.6)',
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: navWidth, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: `calc(100% - ${navWidth}px)`, overflow: 'hidden', paddingBottom: 32, transition: 'margin-left 0.18s ease, width 0.18s ease' }}>
        <header style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Admin</h2>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          {/* Account */}
          <div style={{ ...panelStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(172,207,185,0.14)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 26 }}>account_circle</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                <div style={{ fontSize: 12, color: 'var(--outline)' }}>Administrator</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--outline)' }}>Session expires</span>
                <span style={{ color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono' }}>{formatExpiry(claims?.exp)}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              style={{
                alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)',
                color: 'var(--status-red)', fontFamily: 'Manrope', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.16)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
              Log Out
            </button>
          </div>

          {/* Alert Thresholds */}
          <div style={{ ...panelStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alert Thresholds</div>
              <div style={{ fontSize: 11.5, color: 'var(--outline)', marginTop: 4 }}>
                Controls the worker's anomaly detection. Changes take effect within ~5 minutes (the worker's refresh interval).
              </div>
            </div>

            {status === 'loading' && (
              <div style={{ fontSize: 13, color: 'var(--outline)' }}>Loading…</div>
            )}

            {form && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {THRESHOLD_FIELDS.map(f => (
                  <div key={f.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label htmlFor={`th-${f.key}`} style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontWeight: 600 }}>{f.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          id={`th-${f.key}`}
                          type="number"
                          value={form[f.key]}
                          step={f.step}
                          min={f.min}
                          max={f.max}
                          onChange={e => handleFieldChange(f.key, e.target.value)}
                          style={{
                            width: 84, padding: '5px 8px', borderRadius: 6,
                            border: '1px solid var(--outline-variant)',
                            background: 'var(--surface-container-low)',
                            color: 'var(--on-surface)', fontFamily: 'JetBrains Mono', fontSize: 13,
                            textAlign: 'right', outline: 'none',
                          }}
                        />
                        {f.suffix && <span style={{ fontSize: 12, color: 'var(--outline)', width: 12 }}>{f.suffix}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--outline)' }}>{f.hint}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--outline-variant)', paddingTop: 14 }}>
              <button
                onClick={handleSaveThresholds}
                disabled={!isDirty || !isValid || status === 'saving' || status === 'loading'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--outline-variant)',
                  background: (!isDirty || !isValid || status === 'saving') ? 'var(--surface-container-high)' : 'var(--primary-container)',
                  color: (!isDirty || !isValid || status === 'saving') ? 'var(--outline)' : 'var(--on-surface)',
                  fontFamily: 'Manrope', fontSize: 13, fontWeight: 700,
                  cursor: (!isDirty || !isValid || status === 'saving') ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                {status === 'saving' ? 'Saving…' : 'Save Thresholds'}
              </button>
              {status === 'saved' && !isDirty && (
                <span style={{ fontSize: 12, color: 'var(--status-green)', fontWeight: 600 }}>Saved</span>
              )}
              {status === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--status-red)' }}>{errorMsg}</span>
              )}
            </div>
          </div>

          {/* About */}
          <div style={{ ...panelStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>About</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--outline)' }}>Application</span>
              <span style={{ color: 'var(--on-surface-variant)' }}>IncidentOps</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--outline)' }}>Version</span>
              <span style={{ color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono' }}>v2.4.0-stable</span>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
