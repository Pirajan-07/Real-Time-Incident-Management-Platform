import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function IncidentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token } = useAuth();
  
  const [incident, setIncident] = useState(null);
  
  const fetchIncident = async () => {
    try {
      const data = await api.getIncidentDetail(id, token);
      setIncident(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchIncident();
  }, [id, token]);
  
  if (!incident) return <div style={{ color: 'white', padding: 24, fontFamily: 'Manrope' }}>Loading incident...</div>;

  const handleUpdateStatus = async (newStatus) => {
    try {
      await api.updateIncidentStatus(id, newStatus, token);
      fetchIncident();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const getStatusUI = (status) => {
    switch (status) {
      case 'open': return { label: 'OPEN', color: '#EF4444', bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.3)' };
      case 'acknowledged': return { label: 'ACKNOWLEDGED', color: '#F59E0B', bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.3)' };
      case 'resolved': return { label: 'RESOLVED', color: '#22C55E', bg: 'rgba(34,197,94,0.2)', border: 'rgba(34,197,94,0.3)' };
      default: return { label: 'UNKNOWN', color: '#8c928d', bg: 'rgba(140,146,141,0.2)', border: 'rgba(140,146,141,0.3)' };
    }
  };
  
  const getLevelUI = (level) => {
    if (level === 'ERROR') return { color: '#ffb4ab', bg: 'rgba(147,0,10,0.2)' };
    if (level === 'WARN') return { color: '#F59E0B', bg: 'rgba(245,158,11,0.2)' };
    return { color: 'var(--on-surface-variant)', bg: 'var(--surface-variant)' };
  };

  const ui = getStatusUI(incident.status);
  const created = new Date(incident.created_at);
  const timeAgo = Math.floor((new Date() - created) / 60000) + 'm ago';
  
  const timeline = [
    { time: created.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), label: `Threshold breached (${incident.metric_value.toFixed(1)})`, timeColor: 'var(--error)', dotColor: 'var(--error)' },
    { time: created.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), label: 'Incident created', timeColor: 'var(--on-surface-variant)', dotColor: 'var(--outline-variant)' }
  ];
  if (incident.ai_summary) {
    timeline.push({ time: new Date(incident.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), label: 'AI analysis generated', timeColor: 'var(--secondary)', dotColor: 'var(--secondary)' });
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: 'calc(100% - 220px)', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{ flexShrink: 0, padding: '24px 32px 16px' }}>
          <button onClick={() => navigate('/incidents')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, transition: 'color 0.15s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_left_alt</span>
            Back to Incidents
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
                <h2 style={{ fontSize: 32, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em' }}>{incident.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: ui.bg, border: `1px solid ${ui.border}`, padding: '2px 8px', borderRadius: 2 }}>
                  {incident.status === 'open' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: ui.color, animation: 'pulse 2s infinite' }} />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: ui.color, letterSpacing: '0.05em' }}>{ui.label}</span>
                </div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>Source: <span style={{ color: 'var(--on-surface)' }}>{incident.source}</span></span>
                <span style={{ color: 'var(--outline-variant)' }}>•</span>
                <span>Trigger: <span style={{ color: 'var(--on-surface)' }}>{incident.trigger_reason}</span></span>
                <span style={{ color: 'var(--outline-variant)' }}>•</span>
                <span style={{ color: 'var(--error)' }}>{incident.metric_value.toFixed(1)}</span> vs {incident.threshold_value.toFixed(1)} threshold
                <span style={{ color: 'var(--outline-variant)' }}>•</span>
                <span>Created {timeAgo}</span>
                <span style={{ color: 'var(--outline-variant)' }}>•</span>
                <span style={{ color: 'var(--tertiary)' }}>#INC-{incident.id}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {incident.status === 'open' && (
                <button onClick={() => handleUpdateStatus('acknowledged')} style={{ fontFamily: 'Manrope', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', padding: '8px 16px', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', background: 'none', borderRadius: 2, cursor: 'pointer', transition: 'background 0.15s' }}>ACKNOWLEDGE</button>
              )}
              {incident.status !== 'resolved' && (
                <button onClick={() => handleUpdateStatus('resolved')} style={{ fontFamily: 'Manrope', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', padding: '8px 16px', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', background: 'none', borderRadius: 2, cursor: 'pointer', transition: 'background 0.15s' }}>RESOLVE</button>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 12 }}>
            {/* Main Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* AI Card */}
              {incident.ai_summary && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderLeft: '2px solid var(--secondary)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,182,147,0.05), transparent)', pointerEvents: 'none' }} />
                <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(66,72,68,0.5)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-container-low)' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--secondary)', fontSize: 18 }}>auto_awesome</span>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--secondary)' }}>AI Root Cause Analysis</h3>
                </div>
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 14, color: 'var(--on-surface)', marginBottom: 16, lineHeight: '20px', whiteSpace: 'pre-wrap' }}>
                    {incident.ai_summary}
                  </p>
                </div>
              </div>
              )}

              {/* Related Logs */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 2 }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-container-low)' }}>
                  <h3 style={{ fontSize: 16, color: 'var(--on-surface)' }}>Related Logs - {incident.source}</h3>
                  <button onClick={() => navigate('/logs?source=' + incident.source)} style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--tertiary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                    View all logs
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'JetBrains Mono', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(66,72,68,0.5)', background: 'var(--surface-container-lowest)' }}>
                        {['Time','Level','Message'].map(h => (
                          <th key={h} style={{ padding: '8px 16px', fontWeight: 400, color: 'var(--on-surface-variant)', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(incident.logs || []).map((log, i) => {
                        const lUI = getLevelUI(log.level);
                        const ts = new Date(log.timestamp);
                        return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(66,72,68,0.3)', background: i % 2 ? 'rgba(11,15,12,0.5)' : 'transparent', cursor: 'pointer' }}>
                          <td style={{ padding: '6px 16px', color: 'var(--on-surface-variant)' }}>{ts.toISOString().split('T')[1].replace('Z','')}</td>
                          <td style={{ padding: '6px 16px' }}><span style={{ color: lUI.color, background: lUI.bg, padding: '0 4px', borderRadius: 2 }}>{log.level}</span></td>
                          <td style={{ padding: '6px 16px', color: 'var(--on-surface)' }}>{log.message}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Side Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Timeline */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 2 }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
                  <h3 style={{ fontSize: 16, color: 'var(--on-surface)' }}>Incident Timeline</h3>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {timeline.map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.dotColor, flexShrink: 0, marginTop: 2 }} />
                        {i < timeline.length - 1 && <div style={{ width: 1, flex: 1, background: 'rgba(66,72,68,0.5)', marginTop: 4 }} />}
                      </div>
                      <div style={{ paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: t.timeColor }}>{t.time}</p>
                        <p style={{ fontSize: 14, color: 'var(--on-surface)', marginTop: 2 }}>{t.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
