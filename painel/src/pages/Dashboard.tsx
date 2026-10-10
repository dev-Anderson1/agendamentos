import { Link } from 'react-router-dom';
import { painelApi } from '../api/services';
import { PrevisaoDiariaChart } from '../components/charts/PrevisaoDiariaChart';
import { PrevistoVsRecebidoChart } from '../components/charts/PrevistoVsRecebidoChart';
import { ReceitaMensalChart } from '../components/charts/ReceitaMensalChart';
import { Alert } from '../components/ui/Alert';
import { Loading } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { money } from '../lib/format';

export function DashboardPage() {
  const { isAdmin, usuario } = useAuth();
  const dash = useQuery(() => painelApi.dashboard(), []);
  const mensal = useQuery(() => painelApi.receitaMensal(6), [], isAdmin);
  const previsao = useQuery(() => painelApi.previsao(14), []);

  const erro = dash.error || (isAdmin ? mensal.error : '') || previsao.error;
  if (erro) return <Alert kind="error">{erro}</Alert>;
  if (!dash.data) return <Loading />;

  const data = dash.data;
  const meses = mensal.data?.meses ?? [];
  const diasPrev = previsao.data?.dias ?? [];
  const escopo =
    data.escopo === 'profissional'
      ? `Visão do seu perfil${usuario?.nome ? ` (${usuario.nome})` : ''}.`
      : 'Visão geral do studio — números e gráficos.';

  return (
    <>
      <PageHeader title="Dashboard" subtitle={escopo} />

      <div className="grid-cards">
        <StatCard label="Agendamentos hoje" value={data.hoje.agendamentos} />
        <StatCard label="Previsto hoje" value={money(data.hoje.previsto_reais)} />
        <StatCard label="Recebido hoje" value={money(data.hoje.recebido_reais)} />
        <StatCard label="Recebido no mês" value={money(data.mes.recebido_reais)} />
        <StatCard label="Previsto (futuros)" value={money(data.mes.previsto_futuro_reais)} />
        {isAdmin && <StatCard label="Produtos em falta" value={data.estoque.produtos_baixo} />}
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <h2 className="chart-title">Recebido no mês × previsto futuro</h2>
          <PrevistoVsRecebidoChart
            recebido={data.mes.recebido_reais}
            previsto={data.mes.previsto_futuro_reais}
          />
          <div className="chart-legend">
            <span>
              <i style={{ background: '#7c3140' }} /> Recebido: {money(data.mes.recebido_reais)}
            </span>
            <span>
              <i style={{ background: '#a67c52' }} /> Previsto: {money(data.mes.previsto_futuro_reais)}
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="card chart-card">
            <h2 className="chart-title">Receita mensal (6 meses)</h2>
            <ReceitaMensalChart data={meses} />
          </div>
        )}
      </div>

      <div className="card chart-card">
        <h2 className="chart-title">Previsão de entradas — próximos 14 dias</h2>
        <PrevisaoDiariaChart data={diasPrev} />
      </div>

      <div className="card">
        <strong>{data.mes.agendamentos_futuros}</strong> agendamentos futuros confirmados.
        <div className="acoes">
          <Link to="/agenda">
            <button type="button" className="primary">
              Ver agenda
            </button>
          </Link>
          <Link to="/relatorios">
            <button type="button">Relatórios</button>
          </Link>
          {isAdmin && (
            <Link to="/financeiro">
              <button type="button">Financeiro</button>
            </Link>
          )}
          <Link to="/meu-perfil">
            <button type="button">Meu perfil</button>
          </Link>
        </div>
      </div>
    </>
  );
}
