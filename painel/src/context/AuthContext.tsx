import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clearSession,
  getToken,
  getUsuario,
  loginRequest,
  persistSession,
  setUnauthorizedHandler,
} from '../api/client';
import type { Role, UsuarioPainel } from '../types';

type AuthContextValue = {
  token: string | null;
  usuario: UsuarioPainel | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  role: Role | null;
  login: (login: string, pin: string) => Promise<void>;
  logout: () => void;
  refreshUsuario: (u: UsuarioPainel) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => getToken());
  const [usuario, setUsuario] = useState<UsuarioPainel | null>(() => getUsuario());

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUsuario(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setToken(null);
      setUsuario(null);
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const login = useCallback(async (loginName: string, pin: string) => {
    const data = await loginRequest(loginName.trim(), pin.trim());
    persistSession(data.token, data.usuario);
    setToken(data.token);
    setUsuario(data.usuario);
  }, []);

  const refreshUsuario = useCallback((u: UsuarioPainel) => {
    setUsuario(u);
    const t = getToken();
    if (t) persistSession(t, u);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      usuario,
      isAuthenticated: Boolean(token),
      isAdmin: usuario?.role === 'admin',
      role: usuario?.role ?? null,
      login,
      logout,
      refreshUsuario,
    }),
    [token, usuario, login, logout, refreshUsuario],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
