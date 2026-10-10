import { useState } from 'react';
import { painelApi } from '../api/services';
import { CalendarioMesHeatmap } from '../components/charts/CalendarioMesHeatmap';
import { DiarioMesChart } from '../components/charts/DiarioMesChart';
import { PrevisaoDiariaChart } from '../components/charts/PrevisaoDiariaChart';
import { ReceitaMensalChart } from '../components/charts/ReceitaMensalChart';
import { ServicosChart } from '../components/charts/ServicosChart';
import { money } from '../components/charts/format';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { labelMes, mesAtual } from '../lib/datetime';

export function RelatoriosPage() {
  const { isAdmin } = useAuth();
  const [mes, setMes] = useState(mesAtual());
  const [heatMode, setHeatMode] = useState<'lucro' | 'atend'>('lucro');

  const servicosQ = useQuery(() => painelApi.relatorioServicos(90), [], isAdmin);
  const previsaoQ = useQuery(() => painelApi.previsao(30), []);
  const mensalQ = useQuery(() => painelApi.receitaMensal(6), [], isAdmin);
  const diarioQ = useQuery(() => painelApi.relatorioDiario(mes), [mes], isAdmin);

  const servicos = servicosQ.data?.servicos ?? [];
  const previsao = previsaoQ.data;
  const mensal = mensalQ.data?.meses ?? [];
  const diario = diarioQ.data;
  const d = diario?.destaques;

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle={
          isAdmin
            ? 'Dia a dia do mês, receita, atendimento e comparativo por serviço.'
            : 'Sua previsão de entradas (somente o que está vinculado ao seu perfil).'
        }
      />

      {!isAdmin && (
        <div className="card chart-card" style={{ marginBottom: '1rem' }}>
          <h2 className="chart-title">Minha previsão — próximos 30 dias</h2>
          {previsaoQ.error && <Alert kind="error">{previsaoQ.error}</Alert>}
          {!previsaoQ.data && !previsaoQ.error && <EmptyState>Carregando previsão…</EmptyState>}
          {previsao && (
            <>
              <p>
                Total previsto: <strong>{money(previsao.total_previsto_reais)}</strong>
              </p>
              <PrevisaoDiariaChart data={previsao.dias ?? []} />
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="acoes" style={{ alignItems: 'center', marginTop: 0 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, maxWidth: 220 }}>
            Mês do relatório diário
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </label>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={heatMode === 'lucro' ? 'active' : ''} onClick={() => setHeatMode('lucro')}>
              Calor = lucro
            </button>
            <button type="button" className={heatMode === 'atend' ? 'active' : ''} onClick={() => setHeatMode('atend')}>
              Calor = atendimento
            </button>
          </div>
        </div>
      </div>

      {diarioQ.error && <Alert kind="error">{diarioQ.error}</Alert>}

      {diario && (
        <>
          <h2 className="chart-title" style={{ textTransform: 'capitalize' }}>
            Relatório diário — {labelMes(diario.mes || mes)}
          </h2>

          <div className="grid-cards">
            <StatCard label="Atendimentos no mês" value={diario.resumo.atendimentos} />
            <StatCard label="Recebido (lucro entrado)" value={money(diario.resumo.recebido_reais)} />
            <StatCard label="Previsto dos atendimentos" value={money(diario.resumo.previsto_reais)} />
            <StatCard
              label="Média / dia com movimento"
              value={`${diario.resumo.media_atendimentos} atend.`}
              hint={money(diario.resumo.media_recebido_reais)}
            />
          </div>

          <div className="charts-grid">
            <div className="card">
              <h3 className="chart-title">Destaques do mês</h3>
              <ul className="destaque-list">
                <li>
                  <strong>Mais atendimento:</strong>{' '}
                  {d?.maior_atendimento
                    ? `${d.maior_atendimento.label} (${d.maior_atendimento.atendimentos})`
                    : '—'}
                </li>
                <li>
                  <strong>Menos atendimento:</strong>{' '}
                  {d?.menor_atendimento
                    ? `${d.menor_atendimento.label} (${d.menor_atendimento.atendimentos})`
                    : '—'}
                </li>
                <li>
                  <strong>Maior lucro:</strong>{' '}
                  {d?.maior_lucro
                    ? `${d.maior_lucro.label} (${money(d.maior_lucro.lucro_reais || d.maior_lucro.previsto_reais)})`
                    : '—'}
                </li>
                <li>
                  <strong>Menor lucro:</strong>{' '}
                  {d?.menor_lucro
                    ? `${d.menor_lucro.label} (${money(d.menor_lucro.lucro_reais || d.menor_lucro.previsto_reais)})`
                    : '—'}
                </li>
              </ul>
            </div>
            <div className="card chart-card">
              <h3 className="chart-title">Calendário do mês</h3>
              <CalendarioMesHeatmap dias={diario.dias} modo={heatMode} />
            </div>
          </div>

          <div className="card chart-card">
            <h3 className="chart-title">Atendimentos × receita por dia</h3>
            <DiarioMesChart data={diario.dias} />
          </div>

          <div className="charts-grid">
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '1rem 1rem 0' }}>
                <h3 className="chart-title">Top dias — atendimento</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Atend.</th>
                      <th>Previsto</th>
                      <th>Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diario.ranking_atendimento.map((r) => (
                      <tr key={`a-${r.dia}`}>
                        <td>{r.label}</td>
                        <td>{r.atendimentos}</td>
                        <td>{money(r.previsto_reais)}</td>
                        <td>{money(r.recebido_reais)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!diario.ranking_atendimento.length && <EmptyState>Sem dados.</EmptyState>}
              </div>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '1rem 1rem 0' }}>
                <h3 className="chart-title">Top dias — lucro / recebido</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Recebido</th>
                      <th>Atend.</th>
                      <th>Previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diario.ranking_lucro.map((r) => (
                      <tr key={`l-${r.dia}`}>
                        <td>{r.label}</td>
                        <td>{money(r.recebido_reais)}</td>
                        <td>{r.atendimentos}</td>
                        <td>{money(r.previsto_reais)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!diario.ranking_lucro.length && <EmptyState>Sem dados.</EmptyState>}
              </div>
            </div>
          </div>

          <h3 className="chart-title" style={{ marginTop: '1rem' }}>
            Todos os dias do mês
          </h3>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Atendimentos</th>
                  <th>Cancelados</th>
                  <th>Previsto</th>
                  <th>Recebido / lucro</th>
                </tr>
              </thead>
              <tbody>
                {diario.dias.map((row) => (
                  <tr key={String(row.dia)} className={row.atendimentos ? '' : 'row-muted'}>
                    <td>{row.label}</td>
                    <td>{row.atendimentos}</td>
                    <td>{row.cancelados}</td>
                    <td>{money(row.previsto_reais)}</td>
                    <td>{money(row.recebido_reais)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="chart-title" style={{ marginTop: '1.75rem' }}>
        Visão geral
      </h2>
      <div className="grid-cards">
        <StatCard label="Previsão 30 dias" value={money(previsao?.total_previsto_reais || 0)} />
        <StatCard
          label="Recebido (6 meses)"
          value={money(mensal.reduce((s, m) => s + Number(m.recebido_reais || 0), 0))}
        />
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <h2 className="chart-title">Receita mensal (últimos 6 meses)</h2>
          <ReceitaMensalChart data={mensal} />
        </div>
        <div className="card chart-card">
          <h2 className="chart-title">Por serviço — recebido × previsto (90 dias)</h2>
          <ServicosChart data={servicos} />
        </div>
      </div>

      <div className="card chart-card">
        <h2 className="chart-title">Previsão diária de entradas (30 dias)</h2>
        <PrevisaoDiariaChart data={previsao?.dias || []} />
      </div>
        </>
      )}
    </>
  );
}
