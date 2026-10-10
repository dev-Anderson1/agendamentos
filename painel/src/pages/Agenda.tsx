import { useState } from 'react';
import { Link } from 'react-router-dom';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { EmptyState, Loading } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { AVISO_REMARCAR_PADRAO, PERIODOS_AGENDA } from '../config/constants';
import { useToast } from '../context/ToastContext';
import { useMutation } from '../hooks/useMutation';
import { useQuery } from '../hooks/useQuery';
import type { HorarioAgenda } from '../types';

type ModalAgenda = { tipo: 'avisar' | 'cancelar'; item: HorarioAgenda };

export function AgendaPage() {
  const { notify } = useToast();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS_AGENDA)[number]['id']>('hoje');
  const [modal, setModal] = useState<ModalAgenda | null>(null);
  const [textoAviso, setTextoAviso] = useState(AVISO_REMARCAR_PADRAO);

  const agenda = useQuery(() => painelApi.agenda(periodo), [periodo]);
  const acao = useMutation(async () => {
    if (!modal) return { mensagem: '' };
    if (modal.tipo === 'avisar') return painelApi.avisarCliente(modal.item.id, textoAviso);
    return painelApi.cancelarRemarcar(modal.item.id);
  });

  async function confirmarAcao() {
    try {
      const r = await acao.mutate();
      notify(r.mensagem, 'success');
      setModal(null);
      agenda.reload();
    } catch {
      /* erro já no hook */
    }
  }

  return (
    <>
      <PageHeader title="Agenda" subtitle={agenda.data?.titulo || 'Horários do studio'} />

      <div className="acoes" style={{ marginBottom: '0.75rem' }}>
        <Link to="/agendar">
          <button type="button" className="primary">
            + Novo agendamento
          </button>
        </Link>
      </div>

      <Tabs tabs={PERIODOS_AGENDA} value={periodo} onChange={setPeriodo}>
        <button type="button" onClick={agenda.reload} disabled={agenda.loading}>
          Atualizar
        </button>
      </Tabs>

      {agenda.error && <Alert kind="error">{agenda.error}</Alert>}
      {acao.error && <Alert kind="error">{acao.error}</Alert>}

      {agenda.loading && <Loading />}

      {!agenda.loading && !agenda.data?.itens?.length && <EmptyState>Nenhum horário neste período.</EmptyState>}

      {agenda.data?.itens?.map((h) => (
        <div key={h.id} className="card">
          <div className="quando">{h.quando}</div>
          <div className="meta">
            #{h.id} · {h.cliente_nome} · {h.servico}
            {h.profissional ? ` · ${h.profissional}` : ''}
          </div>
          <div className="acoes">
            <button type="button" className="primary" onClick={() => setModal({ tipo: 'avisar', item: h })}>
              Avisar + remarcar
            </button>
            <button type="button" className="danger" onClick={() => setModal({ tipo: 'cancelar', item: h })}>
              Cancelar + remarcar
            </button>
          </div>
        </div>
      ))}

      <Modal
        open={!!modal}
        title={modal?.tipo === 'avisar' ? 'Avisar cliente' : 'Cancelar horário'}
        onClose={() => setModal(null)}
        actions={
          <>
            <button type="button" onClick={() => setModal(null)} disabled={acao.busy}>
              Voltar
            </button>
            <button type="button" className="primary" onClick={confirmarAcao} disabled={acao.busy}>
              {acao.busy ? 'Enviando…' : 'Confirmar'}
            </button>
          </>
        }
      >
        {modal?.tipo === 'avisar' ? (
          <>
            <p className="meta">Mensagem enviada por WhatsApp com horários livres do sistema.</p>
            <textarea value={textoAviso} onChange={(e) => setTextoAviso(e.target.value)} rows={5} />
          </>
        ) : (
          <p>
            Cancelar horário de <strong>{modal?.item.cliente_nome}</strong> ({modal?.item.quando}) e enviar opções de
            remarcação por WhatsApp?
          </p>
        )}
      </Modal>
    </>
  );
}
