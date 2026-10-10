import { useState } from 'react';
import { Link } from 'react-router-dom';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { Loading } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { errorMessage, money } from '../lib/format';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  funcionario: 'Funcionário',
  usuario: 'Usuário',
};

export function MeuPerfilPage() {
  const { refreshUsuario, isAdmin } = useAuth();
  const me = useQuery(() => painelApi.me(), []);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function aceitarLgpd() {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      await painelApi.aceitarLgpd('1.0');
      setMsg('Aceite LGPD registrado.');
      await me.reload();
      if (me.data?.usuario) refreshUsuario(me.data.usuario);
    } catch (err) {
      setErro(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (me.error) return <Alert kind="error">{me.error}</Alert>;
  if (!me.data) return <Loading />;

  const { usuario, resumo } = me.data;

  return (
    <>
      <PageHeader
        title="Meu perfil"
        subtitle="Seus dados pessoais e o que você tem permissão de ver (LGPD)."
      />

      {(msg || erro) && <Alert kind={erro ? 'error' : 'success'}>{erro || msg}</Alert>}

      <div className="grid-cards">
        <StatCard label="Hoje" value={resumo.hoje} />
        <StatCard label="Futuros" value={resumo.futuros} />
        <StatCard label="Previsto (seus)" value={money(resumo.previsto_reais)} />
        <StatCard label="Recebido no mês" value={money(resumo.recebido_mes_reais)} />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Dados da conta</h2>
        <dl className="perfil-dl">
          <div>
            <dt>Nome</dt>
            <dd>{usuario.nome}</dd>
          </div>
          <div>
            <dt>Login</dt>
            <dd>{usuario.login}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>{ROLE_LABEL[usuario.role] || usuario.role}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{usuario.email || '—'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{usuario.telefone || '—'}</dd>
          </div>
          <div>
            <dt>Profissional vinculado</dt>
            <dd>{usuario.profissional_nome || (usuario.profissional_id ? `#${usuario.profissional_id}` : '—')}</dd>
          </div>
          <div>
            <dt>Aceite LGPD</dt>
            <dd>
              {usuario.lgpd_aceite_em
                ? `Sim (política ${usuario.lgpd_politica_ver || '1.0'})`
                : 'Pendente'}
            </dd>
          </div>
        </dl>

        {!usuario.lgpd_aceite_em && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--muted)', maxWidth: '40rem' }}>
              Em conformidade com a LGPD, confirme que leu a política de privacidade do studio e
              autoriza o tratamento dos seus dados de acesso ao painel.
            </p>
            <button type="button" className="primary" disabled={busy} onClick={aceitarLgpd}>
              {busy ? 'Registrando…' : 'Aceitar política LGPD'}
            </button>
          </div>
        )}

        <p style={{ marginTop: '1.25rem' }}>
          {!isAdmin && (
            <>
              Você só enxerga a própria agenda e previsões.{' '}
              <Link to="/agenda">Ir para minha agenda</Link>
            </>
          )}
          {isAdmin && (
            <>
              Como admin você tem acesso total. Gerencie contas em <Link to="/usuarios">Usuários</Link>.
            </>
          )}
        </p>
      </div>
    </>
  );
}
