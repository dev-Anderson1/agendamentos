import { useState } from 'react';
import { painelApi } from '../api/services';
import { MetodosPagamentoChart } from '../components/charts/MetodosPagamentoChart';
import { money } from '../components/charts/format';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { EmptyState, Loading } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Tabs } from '../components/ui/Tabs';
import { METODOS_PAGAMENTO, STATUS_PAGAMENTO } from '../config/constants';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { mesAtual } from '../lib/datetime';
import { errorMessage, moneyFromCents, parseValorBr } from '../lib/format';
import type { Pagamento } from '../types';

const FILTROS_STATUS = STATUS_PAGAMENTO.map((s) => ({ id: s.id, label: s.label }));
const FILTROS_METODO = [{ id: '', label: 'Qualquer forma' }, ...METODOS_PAGAMENTO];

export function FinanceiroPage() {
  const { notify } = useToast();
  const [filtro, setFiltro] = useState<string>('pendente');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [mesHist, setMesHist] = useState(mesAtual());
  const [modal, setModal] = useState<Pagamento | null>(null);
  const [valorReais, setValorReais] = useState('');
  const [metodo, setMetodo] = useState('pix');
  const [busy, setBusy] = useState(false);

  const pagamentosQ = useQuery(
    () => painelApi.pagamentos({ status: filtro, metodo: filtroMetodo, limite: 80 }),
    [filtro, filtroMetodo],
  );
  const metodosQ = useQuery(() => painelApi.metodosPagamento(mesHist), [mesHist]);

  const pagamentos = pagamentosQ.data?.pagamentos ?? [];
  const metodos = metodosQ.data;

  function abrirPagar(p: Pagamento) {
    setModal(p);
    setValorReais(String((p.valor_previsto_centavos / 100).toFixed(2)).replace('.', ','));
    setMetodo('pix');
  }

  async function confirmarPagamento() {
    if (!modal) return;
    const valor = parseValorBr(valorReais);
    if (!Number.isFinite(valor) || valor <= 0) {
      notify('Informe um valor válido.', 'error');
      return;
    }
    setBusy(true);
    try {
      await painelApi.registrarPagamento(modal.id, valor, metodo);
      setModal(null);
      notify('Pagamento registrado.', 'success');
      pagamentosQ.reload();
      metodosQ.reload();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Pagamentos, formas (PIX, dinheiro, cartão) e histórico." />

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="acoes" style={{ alignItems: 'flex-end', marginTop: 0, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Mês do histórico por forma
            <input type="month" value={mesHist} onChange={(e) => setMesHist(e.target.value)} />
          </label>
          <button type="button" onClick={() => setMesHist('')}>
            Ver todos os meses
          </button>
        </div>
      </div>

      {metodos && (
        <>
          <div className="grid-cards">
            <StatCard label="Pagamentos no período" value={metodos.resumo.total_pagamentos} />
            <StatCard label="Total recebido" value={money(metodos.resumo.total_reais)} />
            {metodos.por_metodo.map((m) => (
              <StatCard
                key={m.metodo}
                label={m.metodo_label}
                value={`${m.quantidade}×`}
                hint={money(m.total_reais)}
              />
            ))}
          </div>

          <div className="charts-grid">
            <div className="card chart-card">
              <h2 className="chart-title">Distribuição por forma de pagamento</h2>
              <MetodosPagamentoChart data={metodos.por_metodo} />
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '1rem 1rem 0' }}>
                <h2 className="chart-title">Resumo por forma</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th>Qtd</th>
                      <th>Total</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metodos.por_metodo.map((m) => (
                      <tr key={m.metodo}>
                        <td>{m.metodo_label}</td>
                        <td>{m.quantidade}</td>
                        <td>{money(m.total_reais)}</td>
                        <td>
                          {metodos.resumo.total_reais
                            ? `${Math.round((m.total_reais / metodos.resumo.total_reais) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!metodos.por_metodo.length && <EmptyState>Nenhum pago neste período.</EmptyState>}
              </div>
            </div>
          </div>

          <h2 className="chart-title" style={{ marginTop: '0.5rem' }}>
            Histórico do que foi pago
          </h2>
          <div className="table-wrap card" style={{ padding: 0, marginBottom: '1.25rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Pago em</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Forma</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {metodos.historico.map((h) => (
                  <tr key={h.id}>
                    <td>{h.pago_em_br || '—'}</td>
                    <td>{h.cliente_nome || '—'}</td>
                    <td>{h.servico || '—'}</td>
                    <td>
                      <Badge tone="pago">{h.metodo_label}</Badge>
                    </td>
                    <td>{money(h.valor_reais)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!metodos.historico.length && <EmptyState>Sem histórico de pagamentos.</EmptyState>}
          </div>
        </>
      )}

      <h2 className="chart-title">Lista de pagamentos</h2>
      <Tabs tabs={FILTROS_STATUS} value={filtro} onChange={setFiltro} />
      <Tabs tabs={FILTROS_METODO} value={filtroMetodo} onChange={setFiltroMetodo} />

      {pagamentosQ.error && <Alert kind="error">{pagamentosQ.error}</Alert>}

      {pagamentosQ.loading ? (
        <Loading />
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Previsto</th>
                <th>Status / forma</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p) => (
                <tr key={p.id}>
                  <td>{p.quando || '—'}</td>
                  <td>{p.cliente_nome || '—'}</td>
                  <td>{p.servico || '—'}</td>
                  <td>{moneyFromCents(p.valor_previsto_centavos)}</td>
                  <td>
                    <Badge tone={p.status as 'pendente' | 'pago' | 'cancelado'}>{p.status}</Badge>
                    {p.status === 'pago' && p.metodo_label && (
                      <>
                        {' '}
                        <Badge tone="pago">{p.metodo_label}</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    {p.status === 'pendente' && (
                      <button type="button" className="primary" onClick={() => abrirPagar(p)}>
                        Registrar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pagamentos.length && <EmptyState>Nenhum pagamento.</EmptyState>}
        </div>
      )}

      <Modal
        open={!!modal}
        title="Registrar pagamento"
        onClose={() => setModal(null)}
        actions={
          <>
            <button type="button" onClick={() => setModal(null)} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="primary" onClick={confirmarPagamento} disabled={busy}>
              {busy ? 'Salvando…' : 'Confirmar'}
            </button>
          </>
        }
      >
        <p className="meta">
          {modal?.cliente_nome} · {modal?.servico}
        </p>
        <label>
          Valor (R$)
          <input value={valorReais} onChange={(e) => setValorReais(e.target.value)} style={{ marginTop: '0.35rem' }} />
        </label>
        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Forma de pagamento
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} style={{ marginTop: '0.35rem' }}>
            {METODOS_PAGAMENTO.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </>
  );
}
