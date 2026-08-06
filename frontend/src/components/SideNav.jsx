import { NavLink } from 'react-router-dom';
import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/incidents', icon: 'emergency', label: 'Incidents' },
  { to: '/logs', icon: 'terminal', label: 'Logs' },
];

export default function SideNav() {
  const { collapsed, toggle } = useNav();
  const width = collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED;

  return (
    <nav style={{
      width,
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      background: 'var(--nav-bg)',
      borderRight: '1px solid var(--outline-variant)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      overflow: 'hidden',
      transition: 'width 0.18s ease',
      zIndex: 50,
    }}>
      {/* Brand */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '16px 8px 24px' : '16px 16px 24px',
          borderBottom: '1px solid var(--outline-variant)',
        }}>
          {!collapsed && (
            <h1 style={{
              fontFamily: 'Manrope',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--on-surface)',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}>IncidentOps</h1>
          )}
          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 6,
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface-variant)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-highest)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-container-high)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* Nav Links */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 12,
                padding: collapsed ? '10px 0' : '8px 16px',
                color: isActive ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                background: isActive ? 'var(--primary-container)' : 'transparent',
                borderLeft: isActive ? '4px solid var(--terracotta)' : '4px solid transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                textDecoration: 'none',
                transition: 'all 0.15s',
                fontFamily: 'Manrope',
                whiteSpace: 'nowrap',
              })}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, flexShrink: 0 }}
              >{icon}</span>
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Footer Nav */}
      <div style={{ borderTop: '1px solid var(--outline-variant)', padding: '8px 0' }}>
        <NavLink
          to="/admin"
          title={collapsed ? 'Admin' : undefined}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 12,
            padding: collapsed ? '10px 0' : '8px 16px',
            color: isActive ? 'var(--on-surface)' : 'var(--on-surface-variant)',
            background: isActive ? 'var(--primary-container)' : 'transparent',
            borderLeft: isActive ? '4px solid var(--terracotta)' : '4px solid transparent',
            fontWeight: isActive ? 600 : 400,
            fontSize: 14,
            textDecoration: 'none',
            transition: 'all 0.15s',
            fontFamily: 'Manrope',
            whiteSpace: 'nowrap',
          })}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>admin_panel_settings</span>
          {!collapsed && 'Admin'}
        </NavLink>
      </div>
    </nav>
  );
}
