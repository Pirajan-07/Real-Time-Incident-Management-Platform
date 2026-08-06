import { createContext, useContext, useEffect, useState } from 'react';

export const SIDENAV_EXPANDED = 220;
export const SIDENAV_COLLAPSED = 64;

const NavContext = createContext();

const STORAGE_KEY = 'sidenav-collapsed';

export const NavProvider = ({ children }) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // localStorage unavailable (e.g. private browsing) — collapse state just won't persist
    }
  }, [collapsed]);

  const toggle = () => setCollapsed(prev => !prev);

  return (
    <NavContext.Provider value={{ collapsed, toggle }}>
      {children}
    </NavContext.Provider>
  );
};

export const useNav = () => useContext(NavContext);
