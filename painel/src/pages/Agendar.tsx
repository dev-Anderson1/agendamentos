import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { hojeIso } from '../lib/datetime';
import { errorMessage, moneyFromCents } from '../lib/format';

export function AgendarPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [servicoId, setServicoId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [data, setData] = useState(hojeIso());
  const [hora, setHora] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const catalogo = useQuery(() => painelApi.servicos(), []);
  const profissionaisQ = useQuery(
    () => painelApi.profissionais(servicoId),
    [servicoId],
    Boolean(servicoId),
  );
  const slotsQ = useQuery(
    () => painelApi.slots({ data, servicoId, profissionalId }),
    [data, servicoId, profissionalId],
    Boolean(servicoId && data),
  );

  const servicos = catalogo.data?.servicos ?? [];
  const profissionais = profissionaisQ.data?.profissionais ?? [];
  const slots = slotsQ.data?.slots ?? [];

  const servico = useMemo(
    () => servicos.find((s) => String(s.id) === servicoId) || null,
    [servicos, servicoId],
  );

  useEffect(() => {
    setProfissionalId('');
    setHora('');
  }, [servicoId]);

  useEffect(() => {
    setHora('');
  }, [data, profissionalId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setBusy(true);
    try {
      const slot = slots.find(
        (s) => s.hora === hora && (!profissionalId || String(s.profissionalId) === profissionalId),
      );
      const r = await painelApi.criarAgendamento({
        cliente_nome: nome.trim(),
        cliente_telefone: telefone.replace(/\D/g, ''),
        servico_id: Number(servicoId),
        profissional_id: profissionalId ? Number(profissionalId) : slot?.profissionalId || null,
        data,
        hora,
        avisar_cliente: avisar,
      });
      const extra =
        r.aviso_cliente?.ok === false ? ` (WhatsApp não enviado: ${r.aviso_cliente.erro})` : '';
      notify(`Agendado #${r.id} — ${r.quando} · ${r.servico} com ${r.profissional}${extra}`, 'success');
      setTimeout(() => navigate('/agenda'), 900);
    } catch (err) {
      setErro(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Novo agendamento"
        subtitle={
          <>
            Marque pelo sistema — mesmos horários livres do WhatsApp.{' '}
            <Link to="/whatsapp">Conectar WhatsApp (QR)</Link>
          </>
        }
      />

      <form className="card agendar-form" onSubmit={onSubmit}>
        <label>
          Serviço
          <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} required>
            <option value="">Selecione…</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} · {s.duracao_minutos} min · {moneyFromCents(s.preco_centavos)}
              </option>
            ))}
          </select>
        </label>

        {servico && (
          <p className="meta">
            {servico.categoria} · duração {servico.duracao_minutos} min · {moneyFromCents(servico.preco_centavos)}
          </p>
        )}

        <label>
          Profissional (opcional)
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} disabled={!servicoId}>
            <option value="">Qualquer disponível</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data
          <input type="date" value={data} min={hojeIso()} onChange={(e) => setData(e.target.value)} required />
        </label>

        <div>
          <div className="meta" style={{ marginBottom: '0.5rem' }}>
            Horários livres {slotsQ.loading ? '(carregando…)' : ''}
          </div>
          {!slotsQ.loading && !slots.length && servicoId && (
            <EmptyState>Nenhum horário livre neste dia (domingo/segunda fechados ou grade cheia).</EmptyState>
          )}
          <div className="slot-grid">
            {slots.map((s) => {
              const key = `${s.hora}-${s.profissionalId}`;
              const selected = hora === s.hora && (!profissionalId || Number(profissionalId) === s.profissionalId);
              return (
                <button
                  key={key}
                  type="button"
                  className={selected ? 'slot active' : 'slot'}
                  onClick={() => {
                    setHora(s.hora);
                    if (!profissionalId) setProfissionalId(String(s.profissionalId));
                  }}
                >
                  <strong>{s.hora}</strong>
                  <span>{s.profissionalNome}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label>
          Nome da cliente
          <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome completo" />
        </label>

        <label>
          WhatsApp da cliente
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
            placeholder="41999999999"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>

        <label className="check-row">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
          Enviar confirmação no WhatsApp da cliente
        </label>

        {(erro || catalogo.error || slotsQ.error) && (
          <Alert kind="error">{erro || catalogo.error || slotsQ.error}</Alert>
        )}

        <div className="acoes">
          <button type="submit" className="primary" disabled={busy || !hora || !servicoId}>
            {busy ? 'Salvando…' : 'Confirmar agendamento'}
          </button>
          <Link to="/agenda">
            <button type="button">Voltar à agenda</button>
          </Link>
        </div>
      </form>
    </>
  );
}
