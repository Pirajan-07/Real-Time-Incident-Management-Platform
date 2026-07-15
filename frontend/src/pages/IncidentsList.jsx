import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function IncidentsList() {
  const { token } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.getIncidents(statusFilter, token);
        setIncidents(data);
      } catch (err) {
        console.error("Failed to fetch incidents", err);
      }
    };
    fetchData();
  }, [statusFilter, token]);

  const tabs = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Acknowledged', value: 'acknowledged' },
    { label: 'Resolved', value: 'resolved' },
  ];

  const getStatusUI = (status) => {
    switch (status) {
      case 'open': return { label: 'Open', color: '#EF4444', dot: '#EF4444', pulse: true, dim: false, metricColor: '#EF4444' };
      case 'acknowledged': return { label: 'Acknowledged', color: '#F59E0B', dot: '#F59E0B', pulse: false, dim: false, metricColor: '#F59E0B' };
      case 'resolved': return { label: 'Resolved', color: '#accfb9', dot: '#accfb9', pulse: false, dim: true, metricColor: 'var(--on-surface-variant)' };
      default: return { label: 'Unknown', color: '#8c928d', dot: '#8c928d', pulse: false, dim: false, metricColor: 'var(--on-surface-variant)' };
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--custom-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: 'calc(100% - 220px)', overflow: 'hidden', paddingBottom: 32 }}>
        {/* TopBar */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 64, width: '100%', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface)', zIndex: 40, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Incidents</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <nav style={{ display: 'flex', gap: 16 }}>
              {tabs.map((tab, i) => (
                <button 
                  key={i} 
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: statusFilter === tab.value ? 'var(--terracotta)' : 'var(--on-surface-variant)',
                    borderBottom: statusFilter === tab.value ? '2px solid var(--terracotta)' : '2px solid transparent',
                    paddingBottom: 4, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.05em', textTransform: 'uppercase', textDecoration: 'none',
                    transition: 'all 0.15s',
                }}>{tab.label}</button>
              ))}
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 16 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex' }}>
                <span className="material-symbols-outlined">filter_list</span>
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', position: 'relative' }}>
                <span className="material-symbols-outlined">notifications</span>
                <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, background: 'var(--error)', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
              </button>
            </div>
          </div>
        </header>

        {/* Table */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--custom-bg)' }}>
          <div style={{ background: 'var(--custom-surface)', border: '1px solid var(--outline-variant)', borderRadius: 2, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', height: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {['Status','Title','Source','Trigger','Metric','Created'].map((h, i) => (
                      <th key={h} style={{ padding: '12px 16px', fontWeight: 400, fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ fontSize: 14 }}>
                  {incidents.map((inc, i) => {
                    const ui = getStatusUI(inc.status);
                    const created = new Date(inc.created_at);
                    const timeAgo = Math.floor((new Date() - created) / 60000) + 'm ago';
                    
                    return (
                    <Link key={i} to={`/incidents/${inc.id}`} style={{ display: 'contents', textDecoration: 'none' }}>
                      <tr style={{ borderBottom: '1px solid rgba(66,72,68,0.5)', opacity: ui.dim ? 0.6 : 1, transition: 'opacity 0.15s, background 0.15s', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ui.dot, display: 'inline-block', animation: ui.pulse ? 'pulse 2s infinite' : 'none', boxShadow: ui.pulse ? `0 0 8px rgba(255,180,171,0.6)` : 'none' }} />
                            <span style={{ color: ui.color, fontWeight: 600 }}>{ui.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--on-surface)' }}>{inc.title}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{inc.source}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{inc.trigger_reason}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', fontSize: 14, color: ui.metricColor }}>{inc.metric_value.toFixed(1)} vs {inc.threshold_value}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--on-surface-variant)' }}>{timeAgo}</td>
                      </tr>
                    </Link>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
