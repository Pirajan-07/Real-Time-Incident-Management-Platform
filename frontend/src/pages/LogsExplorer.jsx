import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  'all',
  'auth-service',
  'payment-gateway',
  'ingress-nginx',
  'user-profile',
  'api-gateway-01',
  'database-cluster-primary',
  'notification-worker',
];

const LEVELS = ['all', 'INFO', 'WARN', 'ERROR'];

const TIME_RANGES = [
  { label: 'Last 15m',  value: '15m',  ms: 15 * 60 * 1000 },
  { label: 'Last 1h',   value: '1h',   ms: 60 * 60 * 1000 },
  { label: 'Last 6h',   value: '6h',   ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 24h',  value: '24h',  ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d',   value: '7d',   ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'All time',  value: 'all',  ms: null },
];

const LIVE_TAIL_INTERVAL_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (val) => {
  if (val == null) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().split('T')[1].replace('Z', '');
};

const timeAgo = (isoStr) => {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

// Semantic level/severity colors — shared language with Dashboard & Incidents.
const getLevelUI = (level) => {
  if (level === 'ERROR') return { color: 'var(--status-red)', bg: 'rgba(239,68,68,0.12)' };
  if (level === 'WARN')  return { color: 'var(--status-amber)', bg: 'rgba(245,158,11,0.12)' };
  return { color: 'var(--outline)', bg: 'rgba(255,255,255,0.06)' };
};

const getSeverityUI = (severity) => {
  if (severity === 'critical') return { color: 'var(--status-red)', bg: 'rgba(239,68,68,0.14)' };
  if (severity === 'high')     return { color: 'var(--status-amber)', bg: 'rgba(245,158,11,0.14)' };
  if (severity === 'medium')   return { color: 'var(--status-info)', bg: 'rgba(95,168,211,0.14)' };
  return { color: 'var(--outline)', bg: 'rgba(255,255,255,0.06)' };
};

// ─── Shared dropdown styles ───────────────────────────────────────────────────

const dropdownMenuStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  minWidth: 200,
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

const panelStyle = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--outline-variant)',
  borderRadius: 10,
  boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -14px rgba(0,0,0,0.6)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LogsExplorer() {
  const { token } = useAuth();
  const { collapsed } = useNav();
  const navWidth = collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED;
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state
  const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || 'all');
  const [levelFilter,  setLevelFilter]  = useState('all');
  const [timeRange,    setTimeRange]    = useState('15m');

  // Data state
  const [logs,      setLogs]      = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // UI state
  const [openDropdown, setOpenDropdown] = useState(null); // 'source'|'level'|'time'|'bell'
  const [liveTail,     setLiveTail]     = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);
  const [bellUnread,   setBellUnread]   = useState(0);

  // Refs for outside-click detection
  const sourceRef = useRef(null);
  const levelRef  = useRef(null);
  const timeRef   = useRef(null);
  const bellRef   = useRef(null);
  const liveTailTimer = useRef(null);

  // ── Compute `since` ISO string from timeRange ──────────────────────────────
  const getSinceISO = useCallback(() => {
    const tr = TIME_RANGES.find(t => t.value === timeRange);
    if (!tr || tr.ms === null) return null;
    return new Date(Date.now() - tr.ms).toISOString();
  }, [timeRange]);

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const since = getSinceISO();
      const data = await api.getLogs(sourceFilter, levelFilter, since, 500, token);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter, levelFilter, getSinceISO, token]);

  // ── Initial + filter-change fetch ─────────────────────────────────────────
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Live Tail interval ─────────────────────────────────────────────────────
  useEffect(() => {
    if (liveTail) {
      liveTailTimer.current = setInterval(fetchLogs, LIVE_TAIL_INTERVAL_MS);
    } else {
      clearInterval(liveTailTimer.current);
    }
    return () => clearInterval(liveTailTimer.current);
  }, [liveTail, fetchLogs]);

  // ── Fetch incidents for bell ───────────────────────────────────────────────
  const fetchIncidents = useCallback(async () => {
    try {
      const data = await api.getIncidents(null, token);
      setIncidents(data);
      const openCount = data.filter(i => i.status === 'open').length;
      setBellUnread(openCount);
    } catch (err) {
      console.error('Failed to fetch incidents', err);
    }
  }, [token]);

  // Fetch incidents on mount for badge count
  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e) => {
      const refs = [sourceRef, levelRef, timeRef, bellRef];
      if (refs.every(r => r.current && !r.current.contains(e.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSourceSelect = (src) => {
    setSourceFilter(src);
    setSearchParams(src !== 'all' ? { source: src } : {});
    setOpenDropdown(null);
  };

  const handleLevelSelect = (lvl) => {
    setLevelFilter(lvl);
    setOpenDropdown(null);
  };

  const handleTimeSelect = (val) => {
    setTimeRange(val);
    setOpenDropdown(null);
  };

  const toggleLiveTail = () => {
    setLiveTail(prev => !prev);
  };

  const toggleDropdown = (name) => {
    if (name === 'bell') fetchIncidents();
    setOpenDropdown(prev => prev === name ? null : name);
  };

  // ── Filtered logs (client-side text search on top of server filters) ───────
  const filteredLogs = logs.filter(log =>
    log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.source?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentTimeLabel = TIME_RANGES.find(t => t.value === timeRange)?.label ?? 'Last 15m';

  // ── Filter chip button style ───────────────────────────────────────────────
  const filterBtnStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: active
      ? 'rgba(212,113,60,0.14)'
      : 'var(--surface-container-low)',
    border: active
      ? '1px solid var(--terracotta)'
      : '1px solid var(--outline-variant)',
    borderRadius: 8,
    padding: '5px 10px',
    color: active ? 'var(--terracotta)' : 'var(--on-surface-variant)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'Manrope',
    fontWeight: 600,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: navWidth, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: `calc(100% - ${navWidth}px)`, overflow: 'hidden', paddingBottom: 32, transition: 'margin-left 0.18s ease, width 0.18s ease' }}>

        {/* ── TopAppBar ── */}
        <header style={{ background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)', display: 'flex', flexDirection: 'column', padding: '20px 24px 16px', gap: 16, flexShrink: 0, zIndex: 30 }}>

          {/* Title Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--outline)' }}>terminal</span>
              Logs Explorer
              {isLoading && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', background: 'var(--surface-container-high)', padding: '2px 10px', borderRadius: 20, border: '1px solid var(--outline-variant)', marginLeft: 4 }}>
                  loading…
                </span>
              )}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

              {/* ── Bell Icon ── */}
              <div ref={bellRef} style={{ position: 'relative' }}>
                <button
                  id="btn-bell"
                  onClick={() => toggleDropdown('bell')}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: 'none',
                    background: openDropdown === 'bell' ? 'var(--surface-container-high)' : 'none',
                    color: bellUnread > 0 ? 'var(--terracotta)' : 'var(--on-surface-variant)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', transition: 'all 0.15s', position: 'relative',
                  }}
                  title="Recent incidents"
                >
                  <span className="material-symbols-outlined">notifications</span>
                  {bellUnread > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--status-red)', border: '1px solid var(--surface-container)',
                    }} />
                  )}
                </button>

                {/* Bell Dropdown */}
                {openDropdown === 'bell' && (
                  <div style={{ ...dropdownMenuStyle, left: 'auto', right: 0, width: 320 }}>
                    <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Incidents
                      </span>
                      {bellUnread > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-red)', background: 'rgba(239,68,68,0.12)', padding: '1px 8px', borderRadius: 20 }}>
                          {bellUnread} open
                        </span>
                      )}
                    </div>
                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {incidents.length === 0 ? (
                        <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center' }}>
                          No incidents
                        </div>
                      ) : (
                        incidents.slice(0, 10).map(inc => {
                          const sev = getSeverityUI(inc.severity);
                          return (
                            <div key={inc.id} style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid var(--outline-variant)',
                              display: 'flex', flexDirection: 'column', gap: 4,
                              background: inc.status === 'open' ? 'rgba(239,68,68,0.05)' : 'transparent',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--on-surface)', flex: 1, lineHeight: 1.4 }}>
                                  {inc.title || inc.source}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: sev.bg, color: sev.color, whiteSpace: 'nowrap' }}>
                                  {inc.severity ?? 'unknown'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>
                                  {inc.source}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--outline-variant)' }}>·</span>
                                <span style={{ fontSize: 10, color: inc.status === 'open' ? 'var(--status-red)' : 'var(--on-surface-variant)', textTransform: 'uppercase', fontWeight: 700 }}>
                                  {inc.status}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--outline-variant)' }}>·</span>
                                <span style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>
                                  {timeAgo(inc.created_at)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Live Tail button ── */}
              <button
                id="btn-live-tail"
                onClick={toggleLiveTail}
                style={{
                  background: liveTail ? 'var(--terracotta)' : 'var(--surface-container-high)',
                  color: liveTail ? '#fff' : 'var(--on-surface-variant)',
                  padding: '6px 12px', borderRadius: 8,
                  border: liveTail ? 'none' : '1px solid var(--outline-variant)',
                  fontFamily: 'Manrope', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.2s',
                }}
                title={liveTail ? 'Stop live tail (refreshing every 5s)' : 'Start live tail (auto-refresh every 5s)'}
              >
                {liveTail ? (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 2s linear infinite' }}>radio_button_checked</span>
                    Live
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                    Live Tail
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── Search + Filter Row ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>

            {/* Search */}
            <div style={{ position: 'relative', flex: 1, maxWidth: 672 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--outline)', fontSize: 18 }}>search</span>
              <input
                type="text"
                placeholder="Search logs (e.g., 'error' OR 'timeout')..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface-container-low)',
                  border: '1px solid var(--outline-variant)', borderRadius: 8,
                  paddingLeft: 34, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                  color: 'var(--on-surface)', fontFamily: 'JetBrains Mono', fontSize: 12,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Filters row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

              {/* ── Source dropdown ── */}
              <div ref={sourceRef} style={{ position: 'relative' }}>
                <button
                  id="btn-source-filter"
                  onClick={() => toggleDropdown('source')}
                  style={filterBtnStyle(sourceFilter !== 'all')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt</span>
                  Source: {sourceFilter === 'all' ? 'All' : sourceFilter}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {openDropdown === 'source' ? 'arrow_drop_up' : 'arrow_drop_down'}
                  </span>
                </button>
                {openDropdown === 'source' && (
                  <div style={dropdownMenuStyle}>
                    {SOURCES.map(src => (
                      <button
                        key={src}
                        onMouseDown={() => handleSourceSelect(src)}
                        style={dropdownItemStyle(sourceFilter === src)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = sourceFilter === src ? 'rgba(212,113,60,0.14)' : 'transparent'; }}
                      >
                        {src === 'all' ? (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>apps</span>
                            All Sources
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--terracotta)', opacity: 0.8 }}>dns</span>
                            {src}
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Level dropdown ── */}
              <div ref={levelRef} style={{ position: 'relative' }}>
                <button
                  id="btn-level-filter"
                  onClick={() => toggleDropdown('level')}
                  style={filterBtnStyle(levelFilter !== 'all')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                  Level: {levelFilter === 'all' ? 'All' : levelFilter}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {openDropdown === 'level' ? 'arrow_drop_up' : 'arrow_drop_down'}
                  </span>
                </button>
                {openDropdown === 'level' && (
                  <div style={{ ...dropdownMenuStyle, minWidth: 140 }}>
                    {LEVELS.map(lvl => {
                      const ui = lvl === 'all' ? null : getLevelUI(lvl);
                      return (
                        <button
                          key={lvl}
                          onMouseDown={() => handleLevelSelect(lvl)}
                          style={dropdownItemStyle(levelFilter === lvl)}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = levelFilter === lvl ? 'rgba(212,113,60,0.14)' : 'transparent'; }}
                        >
                          {lvl === 'all' ? (
                            <>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>done_all</span>
                              All Levels
                            </>
                          ) : (
                            <>
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ui.color, flexShrink: 0 }} />
                              {lvl}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 16, background: 'var(--outline-variant)', margin: '0 2px' }} />

              {/* ── Time range dropdown ── */}
              <div ref={timeRef} style={{ position: 'relative' }}>
                <button
                  id="btn-time-range"
                  onClick={() => toggleDropdown('time')}
                  style={filterBtnStyle(timeRange !== '15m')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
                  {currentTimeLabel}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {openDropdown === 'time' ? 'arrow_drop_up' : 'arrow_drop_down'}
                  </span>
                </button>
                {openDropdown === 'time' && (
                  <div style={{ ...dropdownMenuStyle, minWidth: 150 }}>
                    {TIME_RANGES.map(tr => (
                      <button
                        key={tr.value}
                        onMouseDown={() => handleTimeSelect(tr.value)}
                        style={dropdownItemStyle(timeRange === tr.value)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = timeRange === tr.value ? 'rgba(212,113,60,0.14)' : 'transparent'; }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>history</span>
                        {tr.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ── Logs Table ── */}
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--main-bg)', padding: 20, position: 'relative' }}>
          {/* Live tail banner */}
          {liveTail && (
            <div style={{
              marginBottom: 10, padding: '7px 14px', borderRadius: 8,
              background: 'rgba(212,113,60,0.12)',
              border: '1px solid var(--terracotta)', color: 'var(--terracotta)',
              fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 2s linear infinite' }}>refresh</span>
              Live tail active — refreshing every 5 seconds
              <button
                onClick={toggleLiveTail}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--terracotta)', cursor: 'pointer', fontSize: 12, fontFamily: 'Manrope', fontWeight: 700 }}
              >
                Stop
              </button>
            </div>
          )}

          <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', height: liveTail ? 'calc(100% - 46px)' : '100%', position: 'relative', overflow: 'hidden' }}>

            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '110px 190px 76px 1fr', gap: 8, background: 'var(--panel-bg)', borderBottom: '1px solid var(--outline-variant)', padding: '10px 16px', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
              {['Timestamp', 'Source', 'Level', 'Message'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>

            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'JetBrains Mono', fontSize: 12, display: 'flex', flexDirection: 'column' }}>
              {filteredLogs.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--outline)', gap: 8, padding: 32 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.4 }}>search_off</span>
                  <span style={{ fontSize: 13 }}>No logs match the current filters</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>Try widening the time range or removing a filter</span>
                </div>
              ) : (
                filteredLogs.map((log, i) => {
                  const lUI = getLevelUI(log.level);
                  const alt = i % 2 !== 0;
                  return (
                    <div
                      key={log.id ?? i}
                      style={{
                        display: 'grid', gridTemplateColumns: '110px 190px 76px 1fr', gap: 8,
                        padding: '7px 16px', borderBottom: '1px solid rgba(66,72,68,0.3)',
                        background: alt ? 'rgba(255,255,255,0.015)' : 'transparent',
                        alignItems: 'flex-start', transition: 'background 0.12s', cursor: 'default',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,113,60,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = alt ? 'rgba(255,255,255,0.015)' : 'transparent'}
                    >
                      <div style={{ color: 'var(--outline)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 2 }}>{formatTime(log.timestamp ?? log.created_at)}</div>
                      <div style={{ color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 2 }} title={log.source}>{log.source}</div>
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ display: 'inline-flex', padding: '1.5px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em', background: lUI.bg, color: lUI.color }}>{log.level}</span>
                      </div>
                      <div style={{ color: 'var(--on-surface)', wordBreak: 'break-all', paddingTop: 2 }}>{log.message}</div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer / Pagination */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Showing <strong className="tnum">{filteredLogs.length}</strong> logs</span>
                {sourceFilter !== 'all' && (
                  <span style={{ background: 'rgba(212,113,60,0.12)', color: 'var(--terracotta)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    source: {sourceFilter}
                  </span>
                )}
                {levelFilter !== 'all' && (
                  <span style={{ background: getLevelUI(levelFilter).bg, color: getLevelUI(levelFilter).color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    level: {levelFilter}
                  </span>
                )}
              </div>
              <button
                onClick={fetchLogs}
                title="Refresh logs"
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '4px 10px', color: 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Manrope' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                Refresh
              </button>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>

      {/* Spin keyframe for live tail icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
