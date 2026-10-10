import { useEffect, useRef, useState } from 'react';
import { painelApi } from '../api/services';
import type { ConversaResumo, MensagemChat } from '../types';
import { Alert } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useInterval } from '../hooks/useInterval';
import { useQuery } from '../hooks/useQuery';

function formatTel(tel: string) {
  const d = tel.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel;
}

function formatHora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const mesmaData = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  if (mesmaData(d, hoje)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmaData(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatHoraCompleta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function nomeCurto(conversa: ConversaResumo) {
  if (conversa.push_name) return conversa.push_name;
  return formatTel(conversa.telefone);
}

function iniciais(nome: string) {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const CORES_AVATAR = [
  '#7c6af7', '#e67e22', '#27ae60', '#e74c3c',
  '#2980b9', '#8e44ad', '#16a085', '#d35400',
];

function corAvatar(tel: string) {
  let h = 0;
  for (const c of tel) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

// ───── Conexão WhatsApp ─────
function ConexaoCard() {
  const statusQ = useQuery(() => painelApi.whatsappStatus(), []);
  const qrQ = useQuery(() => painelApi.whatsappQr(), []);

  useInterval(() => {
    statusQ.reload();
    qrQ.reload();
  }, 8000);

  const status = statusQ.data;
  const qr = qrQ.data;
  const conectado = status?.state === 'open' || qr?.conectado;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: conectado ? 0 : '1rem' }}>
        <span
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: conectado ? 'var(--ok, #27ae60)' : '#e74c3c',
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600 }}>
          {conectado ? `Conectado — ${status?.instance || 'salao2'}` : `Desconectado — escaneie o QR`}
        </span>
        <button
          type="button"
          className="secondary"
          style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
          onClick={() => { statusQ.reload(); qrQ.reload(); }}
        >
          Atualizar
        </button>
      </div>

      {!conectado && (
        <>
          {qr?.base64 ? (
            <img
              src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
              alt="QR Code WhatsApp"
              style={{ width: 220, height: 220, display: 'block', borderRadius: 8, margin: '0 auto' }}
            />
          ) : (
            <p className="empty" style={{ textAlign: 'center' }}>
              {statusQ.loading ? 'Carregando QR…' : 'QR indisponível — clique em Atualizar'}
            </p>
          )}
          {qr?.pairingCode && (
            <p className="meta" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              Código de pareamento: <strong>{qr.pairingCode}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ───── Chat ─────
function ChatView({ telefone, onClose }: { telefone: string; onClose: () => void }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function carregar() {
    try {
      const r = await painelApi.whatsappMensagens(telefone, 60);
      setMensagens(r.mensagens || []);
    } catch {
      // silencia
    }
  }

  useEffect(() => { carregar(); }, [telefone]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens]);
  useInterval(carregar, 5000);

  async function enviar() {
    const msg = texto.trim();
    if (!msg) return;
    setEnviando(true);
    setErro('');
    try {
      await painelApi.whatsappEnviar(telefone, msg);
      setTexto('');
      await carregar();
    } catch (e: unknown) {
      setErro(String((e as Error).message || 'Erro ao enviar'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-card, #fff)', borderRadius: 10,
      border: '1px solid var(--border, #e5e7eb)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: 'var(--bg-subtle, #f8f9fa)',
      }}>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>←</button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: corAvatar(telefone), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
        }}>
          {iniciais(formatTel(telefone))}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatTel(telefone)}</div>
        </div>
      </div>

      {/* Mensagens */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '1rem',
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        background: '#e5ddd5',
      }}>
        {mensagens.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', margin: 'auto' }}>Nenhuma mensagem ainda.</p>
        )}
        {mensagens.map((m, i) => {
          const isBot = m.papel === 'assistant';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isBot ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%',
                background: isBot ? '#dcf8c6' : '#fff',
                borderRadius: isBot ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                padding: '0.5rem 0.75rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                fontSize: '0.9rem',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {m.conteudo}
                <div style={{ fontSize: '0.7rem', color: '#999', textAlign: 'right', marginTop: '0.25rem' }}>
                  {formatHoraCompleta(m.criado_em)}
                  {isBot && ' ✓✓'}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {erro && <div style={{ margin: '0 0.75rem' }}><Alert kind="error">{erro}</Alert></div>}
      <div style={{
        display: 'flex', gap: '0.5rem', padding: '0.75rem',
        borderTop: '1px solid var(--border, #e5e7eb)',
        background: 'var(--bg-card, #fff)',
      }}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Digite uma mensagem…"
          rows={2}
          disabled={enviando}
          style={{
            flex: 1, resize: 'none', borderRadius: 8,
            border: '1px solid var(--border, #e5e7eb)',
            padding: '0.5rem 0.75rem', fontSize: '0.9rem',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          className="primary"
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          style={{ alignSelf: 'flex-end', padding: '0.5rem 1rem' }}
        >
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

// ───── Página principal ─────
export function WhatsAppPage() {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const conversasQ = useQuery(() => painelApi.whatsappConversas(50), []);

  useInterval(() => conversasQ.reload(), 10000);

  const conversas = conversasQ.data?.conversas ?? [];

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="Conexão, conversas e atendimento direto pelo painel"
      />

      <div className="grid-cards" style={{ marginBottom: '1rem' }}>
        <StatCard label="Conversas" value={conversas.length} />
      </div>

      <ConexaoCard />

      <div style={{
        display: 'grid',
        gridTemplateColumns: selecionado ? '320px 1fr' : '1fr',
        gap: '1rem',
        height: 520,
      }}>
        {/* Lista de conversas */}
        <div style={{
          background: 'var(--bg-card, #fff)',
          borderRadius: 10,
          border: '1px solid var(--border, #e5e7eb)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 600 }}>
            Conversas recentes
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {conversasQ.loading && conversas.length === 0 && (
              <p className="empty" style={{ padding: '1rem' }}>Carregando…</p>
            )}
            {!conversasQ.loading && conversas.length === 0 && (
              <p className="empty" style={{ padding: '1rem' }}>Nenhuma conversa ainda.</p>
            )}
            {conversas.map((c) => {
              const nome = nomeCurto(c);
              const ativo = selecionado === c.telefone;
              return (
                <button
                  key={c.telefone}
                  type="button"
                  onClick={() => setSelecionado(c.telefone)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 1rem', border: 'none', textAlign: 'left', cursor: 'pointer',
                    background: ativo ? 'var(--primary-light, #ede9fe)' : 'transparent',
                    borderBottom: '1px solid var(--border, #f0f0f0)',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: corAvatar(c.telefone), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                  }}>
                    {iniciais(nome)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                      <span style={{ fontSize: '0.72rem', color: '#999', flexShrink: 0, marginLeft: '0.5rem' }}>{formatHora(c.ultima_msg)}</span>
                    </div>
                    <div style={{
                      fontSize: '0.8rem', color: '#666',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}>
                      {c.ultimo_papel === 'assistant' && '✓ '}
                      {c.ultimo_texto || '…'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        {selecionado && (
          <ChatView
            key={selecionado}
            telefone={selecionado}
            onClose={() => setSelecionado(null)}
          />
        )}
        {!selecionado && (
          <div style={{
            background: 'var(--bg-card, #fff)',
            borderRadius: 10,
            border: '1px solid var(--border, #e5e7eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#aaa', fontSize: '0.95rem',
          }}>
            Selecione uma conversa para visualizar
          </div>
        )}
      </div>
    </>
  );
}
