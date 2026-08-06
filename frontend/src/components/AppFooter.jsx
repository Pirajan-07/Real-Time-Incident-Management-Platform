import { useNav, SIDENAV_EXPANDED, SIDENAV_COLLAPSED } from '../NavContext';

export default function AppFooter() {
  const { collapsed } = useNav();

  return (
    <footer style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      left: collapsed ? SIDENAV_COLLAPSED : SIDENAV_EXPANDED,
      height: 32,
      background: 'var(--surface-container-lowest)',
      borderTop: '1px solid var(--outline-variant)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 16px',
      transition: 'left 0.18s ease',
      zIndex: 40,
    }}>
      <span style={{
        fontFamily: 'JetBrains Mono',
        fontSize: 12,
        color: 'var(--outline)',
        opacity: 0.8,
      }}>IncidentOps © 2024 v2.4.0-stable</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--primary)',
          animation: 'pulse 2s infinite',
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono',
          fontSize: 12,
          color: 'var(--on-surface-variant)',
        }}>Service Connectivity: Nominal</span>
      </div>
    </footer>
  );
}
