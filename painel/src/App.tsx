import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { GuestOnly, RequireAdmin, RequireAuth } from './components/layout/Guards';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UiProvider } from './context/UiContext';
import { AgendaPage } from './pages/Agenda';
import { AgendarPage } from './pages/Agendar';
import { ConsumoPage } from './pages/Consumo';
import { DashboardPage } from './pages/Dashboard';
import { EstoquePage } from './pages/Estoque';
import { FinanceiroPage } from './pages/Financeiro';
import { LoginPage } from './pages/Login';
import { MeuPerfilPage } from './pages/MeuPerfil';
import { PrivacidadePage } from './pages/Privacidade';
import { RelatoriosPage } from './pages/Relatorios';
import { UsuariosPage } from './pages/Usuarios';
import { WhatsAppPage } from './pages/WhatsApp';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/agendar" element={<AgendarPage />} />
          <Route path="/meu-perfil" element={<MeuPerfilPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />

          <Route element={<RequireAdmin />}>
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/consumo" element={<ConsumoPage />} />
            <Route path="/whatsapp" element={<WhatsAppPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/estoque" element={<EstoquePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/painel">
      <AuthProvider>
        <ToastProvider>
          <UiProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </UiProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
