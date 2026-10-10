import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { STUDIO_NOME } from '../../config/constants';
import { useUi } from '../../context/UiContext';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const location = useLocation();
  const { sidebarCollapsed, mobileOpen, toggleSidebar, closeMobile } = useUi();

  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const layoutClass = [
    'layout',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    mobileOpen ? 'sidebar-mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClass}>
      {mobileOpen && (
        <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={closeMobile} />
      )}

      <Sidebar onNavigate={closeMobile} />

      <div className="main-wrap">
        <header className="topbar">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={mobileOpen || !sidebarCollapsed ? 'Recolher menu' : 'Abrir menu'}
            aria-expanded={mobileOpen || !sidebarCollapsed}
          >
            <span className="hamburger" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </button>
          <div className="topbar-title">
            <strong>{STUDIO_NOME}</strong>
            <span>Painel</span>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
