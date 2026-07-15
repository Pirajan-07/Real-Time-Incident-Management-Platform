import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [incidents, setIncidents] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const [kpis, setKpis] = useState([
    { label: 'Open Incidents', value: '0' },
    { label: 'Logs Today', value: '0' },
    { label: 'Avg Error Rate', value: '0%' },
    { label: 'Avg Latency', value: '0ms' },
  ]);

  useEffect(() => {
    let ws;
    const fetchData = async () => {
      try {
        const incData = await api.getIncidents('all', token);
        setIncidents(incData);
        
        const logsData = await api.getLogs('all', 100, token);
        setLogs(logsData);
        
        const openCount = incData.filter(i => i.status === 'open').length;
        const totalLogs = logsData.length;
        const errorLogs = logsData.filter(l => l.level === 'ERROR').length;
        const errorRate = totalLogs > 0 ? ((errorLogs / totalLogs) * 100).toFixed(1) : '0';
        
        setKpis([
          { label: 'Open Incidents', value: String(openCount) },
          { label: 'Logs Today', value: String(totalLogs) },
          { label: 'Avg Error Rate', value: `${errorRate}%` },
          { label: 'Avg Latency', value: '142ms' },
        ]);
      } catch (err) {
        console.error("Fetch error", err);
      }
    };
    
    fetchData();
    
    ws = api.connectWebSocket(token, (msg) => {
      if (msg.type === 'log') {
        setLogs(prev => [msg.data, ...prev].slice(0, 100));
        setKpis(prev => {
          const newKpis = [...prev];
          newKpis[1].value = String(parseInt(newKpis[1].value || '0') + 1);
          return newKpis;
        });
      } else if (msg.type === 'incident_created') {
        setIncidents(prev => [msg.data, ...prev]);
        setKpis(prev => {
          const newKpis = [...prev];
          newKpis[0].value = String(parseInt(newKpis[0].value || '0') + 1);
          return newKpis;
        });
      } else if (msg.type === 'incident_updated') {
        setIncidents(prev => prev.map(inc => inc.id === msg.data.id ? { ...inc, ...msg.data } : inc));
      }
    });
    
    return () => {
      if (ws) ws.close();
    };
  }, [token]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', label: 'Open' };
      case 'acknowledged': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', label: 'Acknowledged' };
      case 'resolved': return { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', label: 'Resolved' };
      default: return { color: '#8c928d', bg: 'rgba(140,146,141,0.1)', border: 'rgba(140,146,141,0.2)', label: 'Unknown' };
    }
  };
  
  const getLevelColor = (level) => {
    if (level === 'ERROR') return '#EF4444';
    if (level === 'WARN') return '#F59E0B';
    return '#8c928d';
  };

  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'acknowledged');

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: 'calc(100% - 220px)', overflow: 'hidden', paddingBottom: 32 }}>
        {/* TopBar */}
        <header style={{ height: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', borderRadius: 4, padding: '4px 12px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--terracotta)', animation: 'pulse 2s infinite' }} />
              <span style={{ color: 'var(--on-surface)', fontWeight: 600, fontSize: 14 }}>Live</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', borderRadius: 4, padding: '4px 12px', color: 'var(--on-surface-variant)', fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#22C55E' }}>check_circle</span>
              All Systems Normal
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {kpis.map((k, i) => (
              <div key={i} style={{ background: 'var(--panel-bg)', border: '1px solid var(--outline-variant)', borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: 'var(--on-surface-variant)', fontWeight: 500, fontSize: 14 }}>{k.label}</span>
                <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em' }}>{k.value}</span>
              </div>
            ))}
          </div>

          {/* Logs + Incidents */}
          <div style={{ display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 12, height: 400 }}>
            {/* Live Logs */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--outline-variant)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--outline-variant)', background: 'rgba(50,54,50,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>Live Logs</h3>
                <span className="material-symbols-outlined" style={{ color: 'var(--outline)', fontSize: 18, cursor: 'pointer' }}>more_horiz</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-dim)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--panel-bg)', borderBottom: '1px solid var(--outline-variant)', zIndex: 10 }}>
                    <tr>
                      {['Time','Source','Level','Message'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--on-surface-variant)' }}>
                    {logs.map((log, i) => {
                      const ts = new Date(log.timestamp);
                      const timeStr = ts.toISOString().split('T')[1].replace('Z', '');
                      return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(66,72,68,0.3)', background: i % 2 ? 'rgba(25,29,25,0.2)' : 'transparent' }}>
                        <td style={{ padding: '8px 16px', whiteSpace: 'nowrap', color: 'var(--outline)' }}>{timeStr}</td>
                        <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>{log.source}</td>
                        <td style={{ padding: '8px 16px', fontWeight: 700, color: getLevelColor(log.level) }}>{log.level}</td>
                        <td style={{ padding: '8px 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{log.message}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Open Incidents */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--outline-variant)', borderRadius: 4, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--outline-variant)', background: 'rgba(50,54,50,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>Open Incidents</h3>
                <span className="material-symbols-outlined" style={{ color: 'var(--outline)', fontSize: 18, cursor: 'pointer' }}>filter_list</span>
              </div>
              <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                {openIncidents.map((inc, i) => {
                  const ui = getStatusColor(inc.status);
                  const created = new Date(inc.created_at);
                  const timeAgo = Math.floor((new Date() - created) / 60000) + 'm ago';
                  return (
                  <div key={i} onClick={() => navigate(`/incidents/${inc.id}`)} style={{ border: '1px solid var(--outline-variant)', borderRadius: 4, padding: 8, background: 'var(--surface-container-low)', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ui.color }} />
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--outline)' }}>#INC-{inc.id}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, background: ui.bg, color: ui.color, border: `1px solid ${ui.border}`, padding: '2px 6px', borderRadius: 4 }}>{ui.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--outline)' }}>{timeAgo}</span>
                      </div>
                    </div>
                    <h4 style={{ fontWeight: 600, color: 'var(--on-surface)', fontSize: 14, marginBottom: 4 }}>{inc.title}</h4>
                    <p style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--on-surface-variant)' }}>{inc.trigger_reason} &middot; threshold {inc.threshold_value}</p>
                  </div>
                )})}
              </div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 250 }}>
            {[
              { title: 'Error Rate - Last Hour', badge: 'Spike Detected', badgeColor: '#EF4444', badgeBg: 'rgba(239,68,68,0.1)', badgeBorder: 'rgba(239,68,68,0.2)',
                path: 'M0,45 L10,44 L20,46 L30,42 L40,45 L50,43 L60,45 L70,42 L80,15 L85,5 L90,20 L95,8 L100,25',
                fill: 'M0,45 L10,44 L20,46 L30,42 L40,45 L50,43 L60,45 L70,42 L80,15 L85,5 L90,20 L95,8 L100,25 L100,50 L0,50 Z', gradId: 'gradError' },
              { title: 'Avg Latency - Last Hour', badge: 'ms', badgeColor: 'var(--outline)', badgeBg: 'transparent', badgeBorder: 'transparent',
                path: 'M0,35 L15,33 L30,36 L45,32 L60,38 L75,15 L85,10 L92,20 L100,25',
                fill: 'M0,35 L15,33 L30,36 L45,32 L60,38 L75,15 L85,10 L92,20 L100,25 L100,50 L0,50 Z', gradId: 'gradLat' },
            ].map((chart, i) => (
              <div key={i} style={{ background: 'var(--panel-bg)', border: '1px solid var(--outline-variant)', borderRadius: 4, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, zIndex: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{chart.title}</h3>
                  <span style={{ fontSize: 12, color: chart.badgeColor, fontWeight: 600, background: chart.badgeBg, padding: '2px 8px', borderRadius: 4, border: `1px solid ${chart.badgeBorder}` }}>{chart.badge}</span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none" viewBox="0 0 100 50">
                    <line x1="0" y1="10" x2="100" y2="10" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                    <line x1="0" y1="25" x2="100" y2="25" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                    <line x1="0" y1="40" x2="100" y2="40" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                    <path d={chart.fill} fill={`url(#${chart.gradId})`} opacity="0.2" />
                    <path d={chart.path} fill="none" stroke="#D4713C" strokeWidth="1.5" strokeLinejoin="miter" />
                    <defs>
                      <linearGradient id={chart.gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4713C" stopOpacity="1" />
                        <stop offset="100%" stopColor="#D4713C" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
