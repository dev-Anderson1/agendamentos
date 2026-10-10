import { useState } from 'react';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { Loading } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useQuery } from '../hooks/useQuery';
import { money } from '../lib/format';

export function ConsumoPage() {
  const [dias, setDias] = useState(30);
  const q = useQuery(() => painelApi.consumo(dias), [dias]);

  if (q.error) return <Alert kind="error">{q.error}</Alert>;
  if (!q.data) return <Loading />;

  const data = q.data;
  const openai = data.por_provedor.openai;
  const meta = data.por_provedor.meta;
  const precos = data.precos_referencia;

  const promptTokens = openai?.metricas?.prompt_tokens?.quantidade ?? 0;
  const completionTokens = openai?.metricas?.completion_tokens?.quantidade ?? 0;
  const requests = openai?.metricas?.requests?.quantidade ?? 0;
  const msgsMeta =
    (meta?.metricas?.mensagens?.quantidade ?? 0) +
    (meta?.metricas?.mensagens_sync?.quantidade ?? 0);
  const conversas = meta?.metricas?.conversas?.quantidade ?? 0;

  return (
    <>
      <PageHeader
        title="Consumo IA e Meta"
        subtitle="Estimativa de gastos com gpt-4o-mini (ChatGPT mini) e WhatsApp (Meta), para projetar o que você pagaria."
      />

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <label>
          Período{' '}
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </label>
      </div>

      <div className="grid-cards">
        <StatCard label={`Total (${dias}d)`} value={money(data.total.custo_reais)} />
        <StatCard label="Projeção mensal" value={money(data.total.projecao_mes_reais)} />
        <StatCard label="IA (OpenAI)" value={money(openai?.custo_reais ?? 0)} />
        <StatCard label="Meta (WhatsApp)" value={money(meta?.custo_reais ?? 0)} />
      </div>

      <div className="charts-grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2 className="chart-title">ChatGPT mini (gpt-4o-mini)</h2>
          <ul className="consumo-list">
            <li>
              Requests: <strong>{requests}</strong>
            </li>
            <li>
              Tokens entrada: <strong>{Math.round(promptTokens).toLocaleString('pt-BR')}</strong>
            </li>
            <li>
              Tokens saída: <strong>{Math.round(completionTokens).toLocaleString('pt-BR')}</strong>
            </li>
            <li>
              Custo estimado: <strong>{money(openai?.custo_reais ?? 0)}</strong>
            </li>
          </ul>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Ref.: US$ {precos.openai.input_usd_por_1m}/1M input · US${' '}
            {precos.openai.output_usd_por_1m}/1M output · câmbio {precos.usd_brl}. {precos.openai.nota}
          </p>
        </div>

        <div className="card">
          <h2 className="chart-title">Meta WhatsApp</h2>
          <ul className="consumo-list">
            <li>
              Mensagens (est.): <strong>{Math.round(msgsMeta).toLocaleString('pt-BR')}</strong>
            </li>
            <li>
              Conversas (est.): <strong>{Math.round(conversas).toLocaleString('pt-BR')}</strong>
            </li>
            <li>
              Custo estimado: <strong>{money(meta?.custo_reais ?? 0)}</strong>
            </li>
          </ul>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Ref.: US$ {precos.meta.mensagem_usd}/msg · US$ {precos.meta.conversa_usd}/conversa · câmbio{' '}
            {precos.usd_brl}. {precos.meta.nota}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="chart-title">Diário (custos estimados)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Provedor</th>
                <th>Qtd</th>
                <th>Custo (R$)</th>
              </tr>
            </thead>
            <tbody>
              {data.diario.length === 0 && (
                <tr>
                  <td colSpan={4}>Sem registros ainda. O uso da IA e as mensagens WhatsApp passam a aparecer aqui.</td>
                </tr>
              )}
              {data.diario.map((d) => (
                <tr key={`${d.dia}-${d.provedor}`}>
                  <td>{d.dia}</td>
                  <td>{d.provedor}</td>
                  <td>{Math.round(d.quantidade).toLocaleString('pt-BR')}</td>
                  <td>{money(d.custo_reais)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
