import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '../config/constants';
import { readStorage, writeStorage } from '../lib/storage';

type UiContextValue = {
  sidebarCollapsed: boolean;
  mobileOpen: boolean;
  toggleSidebar: () => void;
  closeMobile: () => void;
};

const UiContext = createContext<UiContextValue | null>(null);

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => readStorage(STORAGE_KEYS.sidebarCollapsed) === '1',
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggleSidebar = useCallback(() => {
    if (isMobileViewport()) {
      setMobileOpen((open) => !open);
      return;
    }
    setSidebarCollapsed((c) => !c);
  }, []);

  const value = useMemo(
    () => ({ sidebarCollapsed, mobileOpen, toggleSidebar, closeMobile }),
    [sidebarCollapsed, mobileOpen, toggleSidebar, closeMobile],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi deve ser usado dentro de UiProvider');
  return ctx;
}
