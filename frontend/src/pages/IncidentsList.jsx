import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

// Returns e.g. '5m ago' or '—' when date is missing/invalid
const formatTimeAgo = (val) => {
  if (val == null) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return Math.floor((new Date() - d) / 60000) + 'm ago';
};

const getStatusUI = (status) => {
  switch (status) {
    case 'open': return { label: 'Open', color: 'var(--status-red)', bg: 'rgba(239,68,68,0.12)', pulse: true, dim: false, metricColor: 'var(--status-red)' };
    case 'acknowledged': return { label: 'Acknowledged', color: 'var(--status-amber)', bg: 'rgba(245,158,11,0.12)', pulse: false, dim: false, metricColor: 'var(--status-amber)' };
    case 'resolved': return { label: 'Resolved', color: 'var(--status-green)', bg: 'rgba(34,197,94,0.12)', pulse: false, dim: true, metricColor: 'var(--on-surface-variant)' };
    default: return { label: 'Unknown', color: 'var(--outline)', bg: 'rgba(140,146,141,0.12)', pulse: false, dim: false, metricColor: 'var(--on-surface-variant)' };
  }
};

const dropdownMenuStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  minWidth: 240,
  background: 'var(--surface-container-high)',
  border: '1px solid var(--outline-variant)',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  zIndex: 200,
  overflow: 'hidden',
};

const dropdownItemStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '7px 12px',
  background: active ? 'rgba(212,113,60,0.14)' : 'transparent',
  border: 'none',
  color: active ? 'var(--terracotta)' : 'var(--on-surface)',
  fontFamily: 'Manrope',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.1s',
});

const iconBtnStyle = (active) => ({
  background: active ? 'var(--surface-container-high)' : 'none',
  border: 'none',
  borderRadius: 8,
  padding: 6,
  cursor: 'pointer',
  display: 'flex',
  position: 'relative',
  transition: 'background 0.15s',
});

export default function IncidentsList() {
  const { token } = useAuth();
  const { collapsed } = useNav();
  const navWidth = collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED;

  // The full incident set is fetched once and filtered entirely client-side
  // (status + source + trigger) — the dataset is small, this avoids a
  // network round-trip per tab click and keeps live websocket updates
  // (e.g. an incident being acknowledged) reflected instantly regardless
  // of which tab is active.
  const [incidents, setIncidents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [openDropdown, setOpenDropdown] = useState(null); // 'filter' | 'bell' | null

  // Incidents that arrived over the websocket since this page loaded.
  const [newIncidents, setNewIncidents] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const filterRef = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.getIncidents('all', token);
        setIncidents(data);
      } catch (err) {
        console.error("Failed to fetch incidents", err);
      }
    };
    fetchData();
  }, [token]);

  // Live feed: prepend newly-created incidents and track them separately
  // for the bell dropdown; reflect status changes in place.
  useEffect(() => {
    const ws = api.connectWebSocket(token, (msg) => {
      if (msg.type === 'incident_created') {
        setNewIncidents(prev => [msg.data, ...prev].slice(0, 20));
        setUnreadCount(prev => prev + 1);
        setIncidents(prev => [msg.data, ...prev]);
      } else if (msg.type === 'incident_updated') {
        setIncidents(prev =>
          prev.map(inc => inc.id === msg.data.id ? { ...inc, ...msg.data } : inc)
        );
      }
    });
    return () => ws.close();
  }, [token]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleMouseDown = (e) => {
      const refs = [filterRef, bellRef];
      if (refs.every(r => r.current && !r.current.contains(e.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const toggleDropdown = (name) => {
    if (name === 'bell') setUnreadCount(0);
    setOpenDropdown(prev => prev === name ? null : name);
  };

  const tabs = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Acknowledged', value: 'acknowledged' },
    { label: 'Resolved', value: 'resolved' },
  ].map(t => ({ ...t, count: t.value === 'all' ? incidents.length : incidents.filter(i => i.status === t.value).length }));

  // Filter option lists derived from the currently loaded incidents (only shows values that actually occur).
  const availableSources = [...new Set(incidents.map(i => i.source))].sort();
  const availableTriggers = [...new Set(incidents.map(i => i.trigger_reason))].sort();

  const filteredIncidents = incidents.filter(i =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    (sourceFilter === 'all' || i.source === sourceFilter) &&
    (triggerFilter === 'all' || i.trigger_reason === triggerFilter)
  );

  const hasActiveFilter = sourceFilter !== 'all' || triggerFilter !== 'all';

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: navWidth, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: `calc(100% - ${navWidth}px)`, overflow: 'hidden', paddingBottom: 32, transition: 'margin-left 0.18s ease, width 0.18s ease' }}>
        {/* TopBar */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 64, width: '100%', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container)', zIndex: 40, flexShrink: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--status-red)' }}>emergency</span>
            Incidents
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <nav style={{ display: 'flex', gap: 4 }}>
              {tabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: statusFilter === tab.value ? 'var(--surface-container-high)' : 'none',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    color: statusFilter === tab.value ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                    padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    fontFamily: 'Manrope', transition: 'all 0.15s',
                }}>
                  {tab.label}
                  <span className="tnum" style={{
                    fontSize: 10.5, fontWeight: 800, minWidth: 18, textAlign: 'center',
                    padding: '1px 5px', borderRadius: 20,
                    background: statusFilter === tab.value ? 'var(--terracotta)' : 'var(--surface-container-highest)',
                    color: statusFilter === tab.value ? '#fff' : 'var(--outline)',
                  }}>{tab.count}</span>
                </button>
              ))}
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

              {/* Filter (Source + Trigger reason) */}
              <div ref={filterRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => toggleDropdown('filter')}
                  title="Filter by source / trigger"
                  style={{ ...iconBtnStyle(openDropdown === 'filter'), color: hasActiveFilter ? 'var(--terracotta)' : 'var(--on-surface-variant)' }}
                >
                  <span className="material-symbols-outlined">filter_list</span>
                  {hasActiveFilter && (
                    <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, background: 'var(--terracotta)', borderRadius: '50%' }} />
                  )}
                </button>
                {openDropdown === 'filter' && (
                  <div style={dropdownMenuStyle}>
                    <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter</span>
                      {hasActiveFilter && (
                        <button
                          onClick={() => { setSourceFilter('all'); setTriggerFilter('all'); }}
                          style={{ background: 'none', border: 'none', color: 'var(--terracotta)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</div>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      <button onClick={() => setSourceFilter('all')} style={dropdownItemStyle(sourceFilter === 'all')}>All Sources</button>
                      {availableSources.map(src => (
                        <button key={src} onClick={() => setSourceFilter(src)} style={dropdownItemStyle(sourceFilter === src)}>{src}</button>
                      ))}
                    </div>

                    <div style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid var(--outline-variant)' }}>Trigger</div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', paddingBottom: 4 }}>
                      <button onClick={() => setTriggerFilter('all')} style={dropdownItemStyle(triggerFilter === 'all')}>All Triggers</button>
                      {availableTriggers.map(t => (
                        <button key={t} onClick={() => setTriggerFilter(t)} style={dropdownItemStyle(triggerFilter === t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bell: incidents created since this page loaded */}
              <div ref={bellRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => toggleDropdown('bell')}
                  title="New incidents since you arrived"
                  style={{ ...iconBtnStyle(openDropdown === 'bell'), color: 'var(--on-surface-variant)' }}
                >
                  <span className="material-symbols-outlined">notifications</span>
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, background: 'var(--status-red)', borderRadius: '50%', animation: 'pulse 2s infinite', boxShadow: '0 0 0 2px var(--surface-container)' }} />
                  )}
                </button>
                {openDropdown === 'bell' && (
                  <div style={{ ...dropdownMenuStyle, width: 320 }}>
                    <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--outline-variant)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New since you arrived</span>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {newIncidents.length === 0 ? (
                        <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center' }}>
                          Nothing new yet — this fills in live as incidents are created.
                        </div>
                      ) : (
                        newIncidents.map(inc => (
                          <Link
                            key={inc.id}
                            to={`/incidents/${inc.id}`}
                            onClick={() => setOpenDropdown(null)}
                            style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderBottom: '1px solid var(--outline-variant)', textDecoration: 'none' }}
                          >
                            <span style={{ fontSize: 12, color: 'var(--on-surface)', fontWeight: 600 }}>{inc.title}</span>
                            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono' }}>{inc.source} &middot; {formatTimeAgo(inc.created_at)}</span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Table */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--main-bg)' }}>
          <div style={{
            background: 'var(--panel-bg)', border: '1px solid var(--outline-variant)', borderRadius: 10,
            boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -14px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden',
          }}>
            <div style={{ overflow: 'auto', height: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--outline-variant)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {['Status','Title','Source','Trigger','Metric','Created'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 16px', fontWeight: 700, fontSize: 11, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ fontSize: 14 }}>
                  {filteredIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--outline)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.5, display: 'block', marginBottom: 8 }}>search_off</span>
                        No incidents match the current filters
                      </td>
                    </tr>
                  ) : filteredIncidents.map((inc, i) => {
                    const ui = getStatusUI(inc.status);
                    const timeAgo = formatTimeAgo(inc.created_at);

                    return (
                    <Link key={inc.id ?? i} to={`/incidents/${inc.id}`} style={{ display: 'contents', textDecoration: 'none' }}>
                      <tr
                        style={{ borderBottom: '1px solid rgba(66,72,68,0.4)', opacity: ui.dim ? 0.65 : 1, transition: 'background 0.12s, opacity 0.15s', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,113,60,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: ui.bg, color: ui.color, fontSize: 11.5, fontWeight: 800 }}>
                            {ui.pulse && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.8s infinite' }} />}
                            {ui.label}
                          </span>
                        </td>
                        <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--on-surface)' }}>{inc.title}</td>
                        <td style={{ padding: '11px 16px', color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{inc.source}</td>
                        <td style={{ padding: '11px 16px', color: 'var(--on-surface-variant)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{inc.trigger_reason}</td>
                        <td className="tnum" style={{ padding: '11px 16px', fontFamily: 'JetBrains Mono', fontSize: 13, color: ui.metricColor, fontWeight: 700 }}>{inc.metric_value.toFixed(1)} <span style={{ color: 'var(--outline)', fontWeight: 400 }}>vs {inc.threshold_value}</span></td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--outline)', fontSize: 12 }}>{timeAgo}</td>
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
