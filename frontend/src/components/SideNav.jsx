import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/incidents', icon: 'emergency', label: 'Incidents' },
  { to: '/logs', icon: 'terminal', label: 'Logs' },
];

export default function SideNav() {
  return (
    <nav style={{
      width: 220,
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      background: 'var(--nav-bg)',
      borderRight: '1px solid var(--outline-variant)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      zIndex: 50,
    }}>
      {/* Brand */}
      <div>
        <div style={{ padding: '16px 16px 24px', borderBottom: '1px solid var(--outline-variant)' }}>
          <h1 style={{
            fontFamily: 'Manrope',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
          }}>IncidentOps</h1>
        </div>

        {/* Nav Links */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                color: isActive ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                background: isActive ? 'var(--primary-container)' : 'transparent',
                borderLeft: isActive ? '4px solid var(--terracotta)' : '4px solid transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                textDecoration: 'none',
                transition: 'all 0.15s',
                fontFamily: 'Manrope',
              })}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20 }}
              >{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Footer Nav */}
      <div style={{ borderTop: '1px solid var(--outline-variant)', padding: '8px 0' }}>
        <a href="#" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          color: 'var(--on-surface-variant)',
          fontSize: 14,
          textDecoration: 'none',
          transition: 'background 0.15s',
          fontFamily: 'Manrope',
          borderLeft: '4px solid transparent',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-high)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
          Admin
        </a>
      </div>
    </nav>
  );
}
