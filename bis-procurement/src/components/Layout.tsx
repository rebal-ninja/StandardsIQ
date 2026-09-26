import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileSearch, BarChart2, ClipboardList,
  Scale, Clock, ShieldCheck, ChevronLeft, ChevronRight,
  ExternalLink, Menu, X,
} from 'lucide-react';

const navItems = [
  { path: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/search',    icon: BarChart2,        label: 'Search Standards' },
  { path: '/recommend', icon: ClipboardList,    label: 'Recommendations' },
  { path: '/scan',      icon: FileSearch,       label: 'Scan Tender' },
  { path: '/compare',   icon: Scale,            label: 'Compare' },
  { path: '/history',   icon: Clock,            label: 'History' },
  { path: '/verify',    icon: ShieldCheck,      label: 'Verify Standard' },
];

const Layout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="flex h-screen bg-bg-base text-text-primary overflow-hidden">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <motion.aside
        className={`
          fixed md:relative z-50 md:z-auto
          flex flex-col h-full
          border-r border-glass-border bg-bg-base
          transition-transform md:transition-none
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        initial={false}
        animate={{ width: isCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{ minWidth: isCollapsed ? 64 : 240 }}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-glass-border shrink-0">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.button
                key="logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => navigate('/')}
                className="flex items-center gap-2 min-w-0"
              >
                <div className="w-6 h-6 rounded bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-sm bg-accent-teal" />
                </div>
                <span className="font-bold text-sm truncate text-text-primary">StandardsIQ</span>
              </motion.button>
            )}
          </AnimatePresence>
          {isCollapsed && (
            <button
              onClick={() => navigate('/')}
              className="mx-auto w-7 h-7 rounded bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center"
              aria-label="Go to dashboard"
            >
              <div className="w-2 h-2 rounded-sm bg-accent-teal" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(c => !c)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-glass-surface text-text-muted hover:text-text-primary transition-colors shrink-0"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="flex md:hidden p-1.5 rounded-lg hover:bg-glass-surface text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden" role="navigation" aria-label="Main navigation">
          {navItems.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={`
                  relative flex items-center gap-3 mx-2 px-2 py-2.5 rounded-lg mb-0.5
                  transition-all text-sm group
                  ${active
                    ? 'bg-accent-teal/10 text-accent-teal'
                    : 'text-text-muted hover:bg-glass-surface hover:text-text-primary'
                  }
                `}
              >
                {active && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-lg border border-accent-teal/30 bg-accent-teal/10"
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                  />
                )}
                <item.icon size={18} className="relative z-10 shrink-0" />
                <AnimatePresence mode="wait">
                  {!isCollapsed && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-10 truncate font-medium"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* Footer — landing page link */}
        <div className="shrink-0 p-3 border-t border-glass-border">
          <Link
            to="/landing"
            title={isCollapsed ? 'About' : undefined}
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-glass-surface transition-colors text-xs"
          >
            <ExternalLink size={15} className="shrink-0" />
            {!isCollapsed && <span className="truncate">About StandardsIQ</span>}
          </Link>
        </div>
      </motion.aside>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 h-14 px-4 border-b border-glass-border shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-glass-surface text-text-muted hover:text-text-primary transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-sm bg-accent-teal" />
            </div>
            <span className="font-bold text-sm text-text-primary">StandardsIQ</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="p-6 md:p-8 max-w-5xl mx-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
