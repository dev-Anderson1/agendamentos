import { FormEvent, useState } from 'react';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { formatDateTimeBr } from '../lib/datetime';
import { errorMessage } from '../lib/format';
import type { LgpdExport } from '../types';

export function PrivacidadePage() {
  const { notify } = useToast();
  const consentQ = useQuery(() => painelApi.consentimentos(100), []);
  const [telefone, setTelefone] = useState('');
  const [dados, setDados] = useState<LgpdExport | null>(null);
  const [confirmar, setConfirmar] = useState('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [retencaoMsg, setRetencaoMsg] = useState('');

  const consentimentos = consentQ.data?.consentimentos ?? [];

  async function exportar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setMsg('');
    setDados(null);
    setBusy(true);
    try {
      const r = await painelApi.exportarLgpd(telefone);
      setDados(r);
      setMsg(
        `Exportado: ${r.agendamentos.length} agendamento(s), ${r.pagamentos.length} pagamento(s), ${r.mensagens.length} mensagem(ns).`,
      );
    } catch (err) {
      setErro(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function excluir(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setBusy(true);
    try {
      const r = await painelApi.excluirLgpd(telefone, confirmar);
      setDados(null);
      setConfirmar('');
      setMsg(
        `Dados excluídos/anonimizados: ${r.agendamentos_anonimizados} agenda · ${r.mensagens_removidas} msgs · ${r.conversas_removidas} sessões.`,
      );
      notify('Dados da titular processados.', 'success');
      consentQ.reload();
    } catch (err) {
      setErro(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rodarRetencao() {
    setRetencaoMsg('');
    setBusy(true);
    try {
      const r = await painelApi.retencaoLgpd();
      setRetencaoMsg(`Removidas ${r.removidas} mensagens com mais de ${r.dias} dias.`);
    } catch (err) {
      setRetencaoMsg(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function baixarJson() {
    if (!dados) return;
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lgpd-export-${telefone.replace(/\D/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Privacidade (LGPD)" subtitle="Aceites da política, exportação e exclusão de dados das clientes." />

      <div className="card">
        <p className="meta">
          Política pública:{' '}
          <a href="/privacidade" target="_blank" rel="noreferrer">
            /privacidade
          </a>
          . Quando a cliente digita <strong>ok/aceito</strong> no WhatsApp, o sistema grava telefone, data, versão da
          política e o texto que ela viu.
        </p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: '1rem 1rem 0',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <h2 className="chart-title" style={{ margin: 0 }}>
            Aceites salvos ({consentimentos.length})
          </h2>
          <button type="button" onClick={consentQ.reload} disabled={busy}>
            Atualizar
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Telefone</th>
                <th>Resposta</th>
                <th>Versão</th>
                <th>Canal</th>
              </tr>
            </thead>
            <tbody>
              {consentimentos.map((c) => (
                <tr key={c.telefone_tail}>
                  <td>{c.aceito_em_br || '—'}</td>
                  <td>{c.telefone}</td>
                  <td>{c.resposta || '—'}</td>
                  <td>{c.politica_versao}</td>
                  <td>{c.canal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!consentimentos.length && (
            <EmptyState>Nenhum aceite ainda. Aparece aqui após a cliente digitar ok/aceito no WhatsApp.</EmptyState>
          )}
        </div>
      </div>

      <form className="card agendar-form" onSubmit={exportar}>
        <h2 className="chart-title">Buscar / exportar dados</h2>
        <label>
          WhatsApp da cliente
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="41999999999"
            required
            inputMode="tel"
          />
        </label>
        <div className="acoes">
          <button type="submit" className="primary" disabled={busy || !telefone}>
            {busy ? 'Buscando…' : 'Exportar dados'}
          </button>
          {dados && (
            <button type="button" onClick={baixarJson}>
              Baixar JSON
            </button>
          )}
        </div>
      </form>

      {msg && <div className="card">{msg}</div>}
      {erro && <Alert kind="error">{erro}</Alert>}

      {dados && (
        <div className="card">
          <h2 className="chart-title">Resumo da exportação</h2>
          <ul className="destaque-list">
            <li>
              <strong>Telefones:</strong> {dados.titular.telefones_encontrados.join(', ') || '—'}
            </li>
            <li>
              <strong>Agendamentos:</strong> {dados.agendamentos.length}
            </li>
            <li>
              <strong>Pagamentos:</strong> {dados.pagamentos.length}
            </li>
            <li>
              <strong>Mensagens:</strong> {dados.mensagens.length}
            </li>
            <li>
              <strong>Exportado em:</strong> {formatDateTimeBr(dados.exportado_em)}
            </li>
          </ul>
        </div>
      )}

      <form className="card agendar-form" onSubmit={excluir}>
        <h2 className="chart-title">Excluir / anonimizar (direito da titular)</h2>
        <p className="meta">
          Remove mensagens e sessão; anonimiza nome/telefone nos agendamentos. Digite <strong>EXCLUIR</strong> para
          confirmar.
        </p>
        <label>
          Confirmação
          <input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="EXCLUIR" required />
        </label>
        <button type="submit" className="danger" disabled={busy || !telefone || confirmar !== 'EXCLUIR'}>
          Excluir dados desta cliente
        </button>
      </form>

      <div className="card">
        <h2 className="chart-title">Retenção de mensagens</h2>
        <p className="meta">Apaga conversas antigas automaticamente (padrão 180 dias) e pode rodar agora.</p>
        <button type="button" onClick={rodarRetencao} disabled={busy}>
          Rodar limpeza agora
        </button>
        {retencaoMsg && (
          <p className="meta" style={{ marginTop: '0.75rem' }}>
            {retencaoMsg}
          </p>
        )}
      </div>
    </>
  );
}
