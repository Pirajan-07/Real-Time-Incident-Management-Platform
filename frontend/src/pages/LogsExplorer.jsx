import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function LogsExplorer() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialSource = searchParams.get('source') || 'all';
  
  const [logs, setLogs] = useState([]);
  const [sourceFilter, setSourceFilter] = useState(initialSource);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getLogs(sourceFilter, 500, token);
        setLogs(data);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      }
    };
    fetchLogs();
  }, [sourceFilter, token]);

  const getLevelUI = (level) => {
    if (level === 'ERROR') return { color: '#ffb4ab', bg: 'rgba(147,0,10,0.2)', border: 'rgba(147,0,10,0.5)' };
    if (level === 'WARN') return { color: '#ffb693', bg: 'rgba(129,51,0,0.2)', border: 'rgba(129,51,0,0.5)' };
    return { color: 'var(--on-surface-variant)', bg: 'var(--surface-container-highest)', border: 'var(--outline-variant)' };
  };

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
    log.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: 'calc(100% - 220px)', overflow: 'hidden' }}>
        {/* TopAppBar */}
        <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--outline-variant)', display: 'flex', flexDirection: 'column', padding: '24px 24px 16px', gap: 16, flexShrink: 0, zIndex: 30 }}>
          {/* Title Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>terminal</span>
              Logs Explorer
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button style={{ width: 32, height: 32, borderRadius: 2, border: 'none', background: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' }}>
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button style={{ background: 'var(--primary)', color: 'var(--on-primary)', padding: '4px 8px', borderRadius: 2, border: 'none', fontFamily: 'Manrope', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                Live Tail
              </button>
            </div>
          </div>

          {/* Search + Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 672 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)', fontSize: 18 }}>search</span>
              <input 
                type="text" 
                placeholder="Search logs (e.g., 'error' OR 'timeout')..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)',
                  borderRadius: 2, paddingLeft: 32, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
                  color: 'var(--on-surface)', fontFamily: 'JetBrains Mono', fontSize: 12,
                  outline: 'none', boxSizing: 'border-box',
                }} 
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button 
                onClick={() => {
                  const s = prompt("Enter source to filter (or 'all'):", sourceFilter);
                  if (s) {
                    setSourceFilter(s);
                    setSearchParams({ source: s });
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 2, padding: '4px 8px', color: 'var(--on-surface-variant)', fontSize: 12, cursor: 'pointer', fontFamily: 'Manrope' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt</span>
                Source: {sourceFilter}
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_drop_down</span>
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 2, padding: '4px 8px', color: 'var(--on-surface-variant)', fontSize: 12, cursor: 'pointer', fontFamily: 'Manrope' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                Level: All
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_drop_down</span>
              </button>
              <div style={{ width: 1, height: 16, background: 'var(--outline-variant)', margin: '0 4px' }} />
              <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 2, padding: '4px 8px', color: 'var(--on-surface-variant)', fontSize: 12, cursor: 'pointer', fontFamily: 'Manrope' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
                Last 15m
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_drop_down</span>
              </button>
            </div>
          </div>
        </header>

        {/* Logs Table */}
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--background)', padding: 24, paddingBottom: 60, position: 'relative' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 2, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 180px 80px 1fr', gap: 8, background: 'var(--surface-container-high)', borderBottom: '1px solid var(--outline-variant)', padding: '4px 16px', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
              {['Timestamp','Source','Level','Message'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'JetBrains Mono', fontSize: 12, display: 'flex', flexDirection: 'column' }}>
              {filteredLogs.map((log, i) => {
                const lUI = getLevelUI(log.level);
                const ts = new Date(log.timestamp);
                const alt = i % 2 !== 0;
                return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 180px 80px 1fr', gap: 8, padding: '4px 16px', borderBottom: '1px solid rgba(66,72,68,0.3)', background: alt ? 'rgba(16,20,17,0.5)' : 'transparent', alignItems: 'flex-start', transition: 'background 0.1s', cursor: 'pointer' }}>
                  <div style={{ color: 'var(--on-surface-variant)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 2 }}>{ts.toISOString().split('T')[1].replace('Z','')}</div>
                  <div style={{ color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 2 }} title={log.source}>{log.source}</div>
                  <div style={{ flexShrink: 0 }}>
                    <span style={{ display: 'inline-block', padding: '0 4px', borderRadius: 2, background: lUI.bg, color: lUI.color, border: `1px solid ${lUI.border}` }}>{log.level}</span>
                  </div>
                  <div style={{ color: 'var(--on-surface)', wordBreak: 'break-all', paddingTop: 2 }}>{log.message}</div>
                </div>
              )})}
            </div>
            {/* Pagination */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Showing {filteredLogs.length} logs</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {['chevron_left','chevron_right'].map((icon, i) => (
                  <button key={icon} disabled={i === 0} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', background: 'none', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
