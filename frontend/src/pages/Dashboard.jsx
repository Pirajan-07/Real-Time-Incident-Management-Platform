import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideNav from '../components/SideNav';
import AppFooter from '../components/AppFooter';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

// Returns the time portion of an ISO string (HH:MM:SS.mmm) or '—' for null/invalid
const formatTime = (val) => {
  if (val == null) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().split('T')[1].replace('Z', '');
};

// Returns e.g. '5m ago' or '—' when date is missing/invalid
const formatTimeAgo = (val) => {
  if (val == null) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return Math.floor((new Date() - d) / 60000) + 'm ago';
};

// Per-KPI accent (icon + color) — order matches the kpis state array below.
const KPI_META = [
  { icon: 'emergency', color: 'var(--status-red)',   soft: 'rgba(239,68,68,0.12)' },
  { icon: 'terminal',  color: 'var(--primary)',      soft: 'rgba(172,207,185,0.14)' },
  { icon: 'percent',   color: 'var(--status-amber)', soft: 'rgba(245,158,11,0.12)' },
  { icon: 'speed',     color: 'var(--status-info)',  soft: 'rgba(95,168,211,0.12)' },
];

// Chart metadata — the actual series comes from the real /metrics/timeseries
// endpoint (state `metrics`), kept live via the 'metrics_update' websocket push.
const CHART_META = [
  { key: 'error_rate',     title: 'Error Rate - Last Hour',  unit: '%' },
  { key: 'avg_latency_ms', title: 'Avg Latency - Last Hour', unit: 'ms' },
];

// Small icon button that opens a panel's fullscreen view.
const ExpandButton = ({ onClick }) => (
  <button
    onClick={onClick}
    title="Expand to fullscreen"
    style={{
      width: 24, height: 24, flexShrink: 0, borderRadius: 6,
      border: '1px solid var(--outline-variant)',
      background: 'var(--surface-container-high)',
      color: 'var(--on-surface-variant)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'background 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-highest)'}
    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-container-high)'}
  >
    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_full</span>
  </button>
);

// Builds a smooth (Catmull-Rom → cubic Bezier) SVG path from evenly-spaced values.
const buildSmoothPath = (values, width, height, padY = 3) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - padY - ((v - min) / range) * (height - padY * 2),
  ]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return { path: d, lastPoint: pts[pts.length - 1] };
};

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { collapsed } = useNav();
  const navWidth = collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED;

  const [incidents, setIncidents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [expandedPanel, setExpandedPanel] = useState(null); // null | 'logs' | 'incidents'

  // Real bucketed error-rate/latency history — fetched once, then kept live
  // via the 'metrics_update' websocket push (see app/metrics.py on the backend).
  const [metrics, setMetrics] = useState(null);
  // Current alert thresholds, used to decide whether the error-rate chart
  // shows "Spike Detected" against the real, admin-configured threshold.
  const [thresholds, setThresholds] = useState(null);

  // logsToday is kept as dedicated state so the WS increment closure
  // always operates on a stable setter — never on a stale kpis snapshot.
  const [logsToday, setLogsToday] = useState(0);

  const [kpis, setKpis] = useState([
    { label: 'Open Incidents', value: '0' },
    { label: 'Logs Today',     value: '0' },
    { label: 'Avg Error Rate', value: '0%' },
    { label: 'Avg Latency',    value: '0ms' },
  ]);

  // Keep kpis[1] (Logs Today) in sync whenever logsToday changes.
  useEffect(() => {
    setKpis(prev => {
      const next = [...prev];
      next[1] = { ...next[1], value: String(logsToday) };
      return next;
    });
  }, [logsToday]);

  // Keep kpis[2] (Avg Error Rate) and kpis[3] (Avg Latency) in sync with the
  // latest real bucket from `metrics` — replaces what used to be a one-time
  // snapshot (error rate) and a hardcoded '142ms' placeholder (latency).
  useEffect(() => {
    const latest = metrics?.points?.[metrics.points.length - 1];
    if (!latest) return;
    setKpis(prev => {
      const next = [...prev];
      next[2] = { ...next[2], value: `${latest.error_rate.toFixed(1)}%` };
      next[3] = { ...next[3], value: latest.avg_latency_ms != null ? `${Math.round(latest.avg_latency_ms)}ms` : '—' };
      return next;
    });
  }, [metrics]);

  // Esc closes the fullscreen panel view.
  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpandedPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedPanel]);

  useEffect(() => {
    let ws;

    const fetchData = async () => {
      try {
        // ── Incidents ──────────────────────────────────────────────────────
        const incData = await api.getIncidents('all', token);
        setIncidents(incData);

        // ── Recent logs (for the live log table) ───────────────────────────
        // Bug 1 fix: use the correct 5-arg signature (source, level, since, limit, token)
        const logsData = await api.getLogs('all', 'all', null, 100, token);
        setLogs(logsData);

        // ── Logs Today: authoritative COUNT(*) from the DB ─────────────────
        // Compute today's midnight in the local timezone as a UTC ISO string
        // so the backend WHERE created_at >= $n boundary is correct.
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const midnightISO = midnight.toISOString();

        const { count } = await api.getLogCount(midnightISO, token);
        setLogsToday(count);

        // ── Open Incidents KPI (error rate / latency KPIs are synced from
        //    `metrics` below, once loaded) ────────────────────────────────
        const openCount = incData.filter(i => i.status === 'open').length;
        setKpis(prev => {
          const next = [...prev];
          next[0] = { ...next[0], value: String(openCount) };
          return next;
        });

        // ── Real bucketed error-rate/latency history + current thresholds ──
        const [metricsData, thresholdsData] = await Promise.all([
          api.getMetricsTimeseries(token),
          api.getThresholds(token),
        ]);
        setMetrics(metricsData);
        setThresholds(thresholdsData);
      } catch (err) {
        console.error('Fetch error', err);
      }
    };

    fetchData();

    ws = api.connectWebSocket(token, (msg) => {
      if (msg.type === 'log') {
        // Keep the live log table (capped at 100 rows for display)
        setLogs(prev => [msg.data, ...prev].slice(0, 100));
        // Bug 2 fix: increment the authoritative counter by 1.
        // Safe because setLogsToday uses the functional updater — no stale closure.
        setLogsToday(prev => prev + 1);
      } else if (msg.type === 'metrics_update') {
        // Pushed every ~15s by the backend — keeps the charts & error-rate/
        // latency KPIs live without the client polling.
        setMetrics(msg.data);
      } else if (msg.type === 'incident_created') {
        setIncidents(prev => [msg.data, ...prev]);
        setKpis(prev => {
          const next = [...prev];
          next[0] = { ...next[0], value: String(parseInt(next[0].value || '0') + 1) };
          return next;
        });
      } else if (msg.type === 'incident_updated') {
        setIncidents(prev =>
          prev.map(inc => inc.id === msg.data.id ? { ...inc, ...msg.data } : inc)
        );
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

  const getLevelUI = (level) => {
    if (level === 'ERROR') return { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
    if (level === 'WARN')  return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
    return { color: 'var(--outline)', bg: 'rgba(255,255,255,0.06)' };
  };

  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'acknowledged');

  const panelStyle = {
    background: 'var(--panel-bg)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 10,
    boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -14px rgba(0,0,0,0.6)',
  };

  // fullscreen=true renders the same panel with roomier spacing/typography for the takeover view.
  const renderLogsPanel = (fullscreen) => (
    <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: fullscreen ? '12px 20px' : '10px 16px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h3 style={{ fontSize: fullscreen ? 16 : 14, fontWeight: 700, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: fullscreen ? 18 : 16, color: 'var(--outline)' }}>terminal</span>
          Live Logs
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)' }}>{logsToday} today</span>
          {!fullscreen && <ExpandButton onClick={() => setExpandedPanel('logs')} />}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-dim)' }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: fullscreen ? 130 : 100 }} />
            <col style={{ width: fullscreen ? 200 : 170 }} />
            <col style={{ width: fullscreen ? 80 : 68 }} />
            <col />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--panel-bg)', borderBottom: '1px solid var(--outline-variant)', zIndex: 10 }}>
            <tr>
              {['Time','Source','Level','Message'].map(h => (
                <th key={h} style={{ padding: fullscreen ? '10px 20px' : '8px 16px', fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ fontFamily: 'JetBrains Mono', fontSize: fullscreen ? 13 : 12, color: 'var(--on-surface-variant)' }}>
            {logs.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--outline)' }}>No logs yet</td></tr>
            ) : logs.map((log, i) => {
              const timeStr = formatTime(log.timestamp);
              const lvl = getLevelUI(log.level);
              const cellPad = fullscreen ? '10px 20px' : '7px 16px';
              return (
              <tr key={i} style={{ borderBottom: '1px solid rgba(66,72,68,0.3)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ padding: cellPad, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--outline)' }}>{timeStr}</td>
                <td style={{ padding: cellPad, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.source}>{log.source}</td>
                <td style={{ padding: cellPad }}>
                  <span style={{ display: 'inline-flex', padding: '1.5px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em', background: lvl.bg, color: lvl.color }}>{log.level}</span>
                </td>
                <td style={{ padding: cellPad, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--on-surface)' }} title={log.message}>{log.message}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderIncidentsPanel = (fullscreen) => (
    <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: fullscreen ? '12px 20px' : '10px 16px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h3 style={{ fontSize: fullscreen ? 16 : 14, fontWeight: 700, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: fullscreen ? 18 : 16, color: 'var(--outline)' }}>emergency</span>
          Open Incidents
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)' }}>{openIncidents.length} open</span>
          {!fullscreen && <ExpandButton onClick={() => setExpandedPanel('incidents')} />}
        </div>
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: fullscreen ? 16 : 9,
        display: fullscreen ? 'grid' : 'flex',
        flexDirection: fullscreen ? undefined : 'column',
        gridTemplateColumns: fullscreen ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined,
        alignContent: fullscreen ? 'start' : undefined,
        gap: fullscreen ? 12 : 7,
      }}>
        {openIncidents.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--outline)', fontSize: 12, minHeight: 120 }}>No open incidents</div>
        ) : openIncidents.map((inc, i) => {
          const ui = getStatusColor(inc.status);
          const timeAgo = formatTimeAgo(inc.created_at);
          return (
          <div key={i} onClick={() => navigate(`/incidents/${inc.id}`)} style={{ position: 'relative', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: fullscreen ? '12px 14px 12px 16px' : '9px 10px 9px 13px', background: 'var(--surface-container-low)', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--outline)'; e.currentTarget.style.transform = 'translateX(1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 3, background: ui.color }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--outline)', fontWeight: 700 }}>#INC-{inc.id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, background: ui.bg, color: ui.color, padding: '1.5px 7px', borderRadius: 20 }}>
                  {inc.status === 'open' && <span style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.8s infinite' }} />}
                  {ui.label}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--outline)' }}>{timeAgo}</span>
              </div>
            </div>
            <h4 style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: fullscreen ? 14 : 13, marginBottom: 2 }}>{inc.title}</h4>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--outline)' }}>{inc.trigger_reason} &middot; threshold {inc.threshold_value}</p>
          </div>
        )})}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', fontFamily: 'Manrope', overflow: 'hidden' }}>
      <SideNav />
      <div style={{ marginLeft: navWidth, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', width: `calc(100% - ${navWidth}px)`, overflow: 'hidden', paddingBottom: 32, transition: 'margin-left 0.18s ease, width 0.18s ease' }}>
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

        {/* Board — grid rows are fr-based so everything fits the viewport with no scrolling, at any zoom level */}
        <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'grid', gridTemplateRows: 'auto minmax(0,1.8fr) minmax(150px,0.85fr)', gap: 14 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {kpis.map((k, i) => {
              const meta = KPI_META[i];
              return (
                <div key={i} style={{ ...panelStyle, position: 'relative', padding: '14px 16px 12px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: meta.color }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                      <span style={{ color: 'var(--on-surface-variant)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
                      <span className="tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--on-surface)', letterSpacing: '-0.02em' }}>{k.value}</span>
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.soft, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{meta.icon}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Logs + Incidents */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, minHeight: 0 }}>
            {renderLogsPanel(false)}
            {renderIncidentsPanel(false)}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minHeight: 0 }}>
            {CHART_META.map((chart, i) => {
              const points = metrics?.points ?? [];
              const values = points.length > 0 ? points.map(p => p[chart.key] ?? 0) : Array(12).fill(0);
              const { path, lastPoint } = buildSmoothPath(values, 100, 50, 3);
              const areaPath = `${path} L100,50 L0,50 Z`;
              const gradId = `chartGrad${i}`;

              const latest = points[points.length - 1];
              const currentValue = latest ? latest[chart.key] : null;
              const isErrorChart = chart.key === 'error_rate';
              const isSpike = isErrorChart && thresholds && currentValue != null && currentValue > thresholds.error_rate_threshold;
              const current = currentValue == null ? '—' : isErrorChart ? `${currentValue.toFixed(1)}%` : `${Math.round(currentValue)}ms`;

              const badge = isErrorChart ? (isSpike ? 'Spike Detected' : 'Normal') : 'ms';
              const badgeColor = isErrorChart ? (isSpike ? 'var(--status-red)' : 'var(--status-green)') : 'var(--outline)';
              const badgeBg = isErrorChart ? (isSpike ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)') : 'transparent';

              return (
                <div key={i} style={{ ...panelStyle, display: 'flex', flexDirection: 'column', padding: '13px 16px 10px', minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>{chart.title}</h3>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: 20, display: 'inline-block' }}>{badge}</span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: isSpike ? 'var(--status-red)' : 'var(--on-surface)', letterSpacing: '-0.02em' }}>{current}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>current</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: 6 }}>
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none" viewBox="0 0 100 50">
                      <line x1="0" y1="8" x2="100" y2="8" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                      <line x1="0" y1="25" x2="100" y2="25" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                      <line x1="0" y1="42" x2="100" y2="42" stroke="#424844" strokeWidth="0.5" strokeDasharray="2,2" />
                      <path d={areaPath} fill={`url(#${gradId})`} opacity="0.9" />
                      <path d={path} fill="none" stroke="#D4713C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="1.8" fill="#D4713C" />
                      <circle className="chart-endpoint-glow" cx={lastPoint[0]} cy={lastPoint[1]} r="1.8" fill="#D4713C" />
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D4713C" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#D4713C" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <AppFooter />
      </div>

      {/* Fullscreen panel takeover */}
      {expandedPanel && (
        <div
          role="dialog"
          aria-modal="true"
          className="panel-fullscreen-in"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--main-bg)', display: 'flex', flexDirection: 'column' }}
        >
          <header style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--outline)' }}>
                {expandedPanel === 'logs' ? 'terminal' : 'emergency'}
              </span>
              {expandedPanel === 'logs' ? 'Live Logs' : 'Open Incidents'}
            </h2>
            <button
              onClick={() => setExpandedPanel(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-high)',
                color: 'var(--on-surface)', fontFamily: 'Manrope', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-highest)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-container-high)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close_fullscreen</span>
              Exit Fullscreen
            </button>
          </header>
          <div style={{ flex: 1, minHeight: 0, padding: 20 }}>
            {expandedPanel === 'logs' ? renderLogsPanel(true) : renderIncidentsPanel(true)}
          </div>
        </div>
      )}
    </div>
  );
}
