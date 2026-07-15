import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div style={{ background: '#F2F0E9', minHeight: '100vh', fontFamily: 'Manrope' }}>
      {/* TopNavBar */}
      <nav style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 50,
        background: 'rgba(242,240,233,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(195,200,193,0.3)',
        display: 'flex', justifyContent: 'center',
        height: 80,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', maxWidth: 1280, padding: '0 40px',
        }}>
          <a href="#" style={{ fontSize: 24, fontWeight: 800, color: '#1b3022', textDecoration: 'none', letterSpacing: '-0.02em' }}>IncidentOps</a>
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <a href="#features" style={{ fontSize: 16, fontWeight: 600, color: '#434843', textDecoration: 'none' }}>Features</a>
            <a href="#how-it-works" style={{ fontSize: 16, fontWeight: 600, color: '#434843', textDecoration: 'none' }}>How it Works</a>
          </div>
          <Link to="/login" style={{
            background: '#1b3022', color: '#fff', fontWeight: 600, fontSize: 12,
            letterSpacing: '0.05em', padding: '12px 24px', borderRadius: 2, textDecoration: 'none',
          }}>Get Started</Link>
        </div>
      </nav>

      <main style={{ paddingTop: 128, paddingBottom: 96 }}>
        {/* Hero */}
        <section style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 40px 96px', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 40, left: '25%', width: 12, height: 12, borderRadius: '50%', background: '#944a04', opacity: 0.6 }} />
          <div style={{ position: 'absolute', top: 160, right: '25%', width: 16, height: 16, borderRadius: '50%', background: '#5b0a00', opacity: 0.5 }} />
          <div style={{ position: 'absolute', bottom: 80, left: '33%', width: 8, height: 8, borderRadius: '50%', background: '#1b3022', opacity: 0.4 }} />

          <h1 style={{ fontSize: 48, fontWeight: 800, color: '#1b3022', maxWidth: 896, margin: '0 auto 24px', lineHeight: '56px', letterSpacing: '-0.02em' }}>
            Catch incidents before your users do.
          </h1>
          <p style={{ fontSize: 18, fontWeight: 500, color: '#819986', maxWidth: 672, margin: '0 auto 40px', lineHeight: '28px' }}>
            Real-time log monitoring with automatic anomaly detection and AI-powered root cause analysis — so your team knows what broke before your users do.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 80 }}>
            <Link to="/login" style={{
              background: '#1b3022', color: '#fff', fontWeight: 600, fontSize: 12,
              letterSpacing: '0.05em', padding: '16px 32px', borderRadius: 2, textDecoration: 'none',
            }}>Get Started</Link>
            <Link to="/dashboard" style={{
              border: '2px solid #1b3022', color: '#1b3022', fontWeight: 600, fontSize: 12,
              letterSpacing: '0.05em', padding: '16px 32px', borderRadius: 2, textDecoration: 'none',
              background: 'transparent',
            }}>View Demo</Link>
          </div>

          {/* Dashboard Mockup */}
          <div style={{
            maxWidth: 896, margin: '0 auto',
            background: '#f6f4ec', border: '1px solid rgba(195,200,193,0.3)',
            borderRadius: 12, padding: 24, textAlign: 'left', overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(6,27,14,0.08)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(195,200,193,0.3)' }}>
              {['#c3c8c1','#c3c8c1','#c3c8c1'].map((c,i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 24 }}>
              {/* Log Table */}
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1b3022', marginBottom: 16 }}>Live Logs</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(195,200,193,0.5)' }}>
                      {['Time','Source','Level','Message'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', fontWeight: 600, fontSize: 12, color: '#434843', letterSpacing: '0.05em', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { time: '10:45:12', src: 'api-gateway-01', level: 'ERROR', lvlColor: '#5b0a00', lvlBg: 'rgba(91,10,0,0.1)', msg: 'Connection timeout to database cluster' },
                      { time: '10:45:10', src: 'auth-service-03', level: 'WARN', lvlColor: '#944a04', lvlBg: 'rgba(148,74,4,0.1)', msg: 'High latency detected in token validation' },
                      { time: '10:45:05', src: 'payment-worker', level: 'INFO', lvlColor: '#1b3022', lvlBg: 'rgba(27,48,34,0.1)', msg: 'Processed batch payment queue successfully' },
                      { time: '10:44:59', src: 'frontend-web', level: 'INFO', lvlColor: '#1b3022', lvlBg: 'rgba(27,48,34,0.1)', msg: 'User session refreshed (ID: 8x2f...9p)' },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(195,200,193,0.3)' }}>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(67,72,67,0.8)', fontFamily: 'JetBrains Mono' }}>{row.time}</td>
                        <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#1b1c18' }}>{row.src}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 2, fontSize: 12, fontWeight: 600, color: row.lvlColor, background: row.lvlBg }}>{row.level}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'JetBrains Mono', color: '#1b1c18' }}>{row.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Incidents Sidebar */}
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1b3022', marginBottom: 16 }}>Active Incidents</h3>
                {[
                  { status: 'Active', statusColor: '#5b0a00', statusBg: 'rgba(91,10,0,0.1)', id: '#INC-402', title: 'DB Connection Drops', desc: 'Multiple services reporting timeouts connecting to main cluster.' },
                  { status: 'Investigating', statusColor: '#944a04', statusBg: 'rgba(148,74,4,0.1)', id: '#INC-401', title: 'API Latency Spike', desc: 'P99 latency exceeding 500ms on US-East region endpoints.' },
                ].map((inc, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(195,200,193,0.3)', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 2, fontSize: 12, fontWeight: 600, color: inc.statusColor, background: inc.statusBg }}>{inc.status}</span>
                      <span style={{ fontSize: 12, color: 'rgba(67,72,67,0.6)' }}>{inc.id}</span>
                    </div>
                    <h4 style={{ fontSize: 16, fontWeight: 600, color: '#1b3022', marginBottom: 4 }}>{inc.title}</h4>
                    <p style={{ fontSize: 14, color: '#434843', lineHeight: '20px' }}>{inc.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section style={{ borderTop: '1px solid rgba(195,200,193,0.3)', borderBottom: '1px solid rgba(195,200,193,0.3)', background: '#f6f4ec', padding: '64px 40px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 32, textAlign: 'center' }}>
            {[
              { val: '3', label: 'Anomaly Detection Rules' },
              { val: 'Sub-Second', label: 'Alert Latency' },
              { val: 'Zero', label: 'Duplicate Incidents' },
              { val: 'AI', label: 'Powered Analysis' },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 48, fontWeight: 800, color: '#1b3022', letterSpacing: '-0.02em' }}>{s.val}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#434843', marginTop: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" style={{ maxWidth: 1280, margin: '0 auto', padding: '96px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#1b3022', letterSpacing: '-0.01em' }}>From Log to Resolution in Seconds.</h2>
          </div>
          <div style={{ position: 'relative', maxWidth: 896, margin: '0 auto' }}>
            <div style={{ position: 'absolute', top: 24, left: '10%', right: '10%', height: 1, background: 'rgba(195,200,193,0.5)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 48, textAlign: 'center' }}>
              {[
                { step: '01 Ingest', desc: 'Logs stream in continuously via Redis Streams from any source' },
                { step: '02 Detect', desc: 'Rolling-window analysis flags error spikes, latency issues, and failure bursts' },
                { step: '03 Resolve', desc: 'AI generates root cause analysis; team acknowledges and resolves via live dashboard' },
              ].map((s, i) => (
                <div key={i} style={{ position: 'relative', background: '#F2F0E9', zIndex: 10, padding: '0 16px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#1b3022', marginBottom: 8 }}>{s.step}</div>
                  <p style={{ fontSize: 16, fontWeight: 500, color: '#434843', lineHeight: '24px' }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ maxWidth: 1280, margin: '0 auto', padding: '96px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#1b3022', marginBottom: 16, letterSpacing: '-0.01em' }}>Precision in Every Alert</h2>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#434843', maxWidth: 672, margin: '0 auto' }}>
              Designed for clarity, built for speed. Everything you need to manage incidents without the noise.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24 }}>
            {[
              { icon: 'radar', iconColor: '#1b3022', iconBg: 'rgba(27,48,34,0.1)', title: 'Real-Time Anomaly Detection', desc: 'Continuously monitors error rates, latency, and failure bursts using rolling-window analysis to catch issues as they happen.' },
              { icon: 'psychology', iconColor: '#944a04', iconBg: 'rgba(148,74,4,0.1)', title: 'AI Root Cause Analysis', desc: 'Automatically generates incident summaries and suggested troubleshooting steps using LLM-powered log analysis.' },
              { icon: 'filter_alt', iconColor: '#5b0a00', iconBg: 'rgba(91,10,0,0.1)', title: 'Smart Incident Deduplication', desc: 'Prevents alert storms by recognizing ongoing issues instead of creating duplicate incidents.' },
              { icon: 'monitoring', iconColor: '#1b3022', iconBg: 'rgba(27,48,34,0.1)', title: 'Live Monitoring Dashboard', desc: 'Real-time log streaming and incident tracking via WebSockets, with full incident lifecycle management.' },
            ].map((f, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid rgba(195,200,193,0.3)',
                borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: f.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                  <span className="material-symbols-outlined" style={{ color: f.iconColor, fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1b3022', marginBottom: 12 }}>{f.title}</h3>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#434843', lineHeight: '20px' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Built With */}
        <section style={{ borderTop: '1px solid rgba(195,200,193,0.3)', padding: '64px 40px', background: '#f6f4ec' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
              {['Python','FastAPI','PostgreSQL','Redis','Docker','React','WebSockets'].map(t => (
                <span key={t} style={{
                  padding: '8px 16px', borderRadius: '9999px',
                  border: '1px solid rgba(195,200,193,0.5)',
                  color: '#434843', fontSize: 14, fontWeight: 500,
                  background: '#fbf9f2',
                }}>{t}</span>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ background: '#f0eee7', borderTop: '1px solid rgba(195,200,193,0.5)', padding: '24px 40px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#1b3022', letterSpacing: '-0.02em' }}>IncidentOps</span>
            <div style={{ width: 1, height: 16, background: 'rgba(195,200,193,0.5)' }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#434843' }}>Real-time incident management, built for engineering teams.</span>
          </div>
          <a href="#" style={{ fontSize: 14, fontWeight: 500, color: '#434843', textDecoration: 'none' }}>GitHub</a>
        </div>
      </footer>
    </div>
  );
}
