import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

const NAV_ITEMS = [
  { path: '/',         label: 'Dashboard',       icon: '⊞' },
  { path: '/search',   label: 'Search Standards', icon: '🔍' },
  { path: '/recommend',label: 'Recommendations',  icon: '★' },
  { path: '/scan',     label: 'Scan Tender',      icon: '📄' },
  { path: '/compare',  label: 'Compare',          icon: '⇄' },
  { path: '/history',  label: 'History',          icon: '🕐' },
  { path: '/verify',   label: 'Verify Standard',  icon: '✓' },
];

function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={`layout ${collapsed ? 'layout--collapsed' : ''}`}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="layout__overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <span className="sidebar__logo-mark" aria-hidden="true">BIS</span>
            {!collapsed && (
              <div className="sidebar__logo-text">
                <span className="sidebar__logo-title">StandardsIQ</span>
                <span className="sidebar__logo-sub">Team NEXUS · SIH 2026</span>
              </div>
            )}
          </div>
          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
              title={collapsed ? item.label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <span className="sidebar__link-icon" aria-hidden="true">{item.icon}</span>
              {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          {!collapsed && (
            <p className="sidebar__footer-text">
              StandardsIQ<br />
              <span>SIH 2026 · PS 26108</span>
            </p>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="layout__main">
        {/* Mobile topbar */}
        <header className="layout__topbar">
          <button
            className="layout__menu-btn"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="layout__topbar-title">StandardsIQ</span>
        </header>

        <main className="layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
