import { FormEvent, useMemo, useState } from 'react';
import { painelApi } from '../api/services';
import { Alert } from '../components/ui/Alert';
import { Loading } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useQuery } from '../hooks/useQuery';
import { errorMessage } from '../lib/format';
import type { Role, UsuarioPainel } from '../types';

const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Admin (acesso total)' },
  { id: 'funcionario', label: 'Funcionário (só o seu perfil)' },
  { id: 'usuario', label: 'Usuário (perfil limitado)' },
];

const emptyForm = {
  nome: '',
  login: '',
  email: '',
  telefone: '',
  pin: '',
  role: 'funcionario' as Role,
  profissional_id: '',
  ativo: true,
};

export function UsuariosPage() {
  const list = useQuery(() => painelApi.usuarios(), []);
  const pros = useQuery(() => painelApi.profissionaisOpcoes(), []);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      const payload = {
        nome: form.nome,
        login: form.login,
        email: form.email || null,
        telefone: form.telefone || null,
        pin: form.pin || undefined,
        role: form.role,
        profissional_id: form.profissional_id ? Number(form.profissional_id) : null,
        ativo: form.ativo,
      };
      if (editId) {
        const body = { ...payload };
        if (!body.pin) delete body.pin;
        await painelApi.atualizarUsuario(editId, body);
        setMsg('Usuário atualizado.');
      } else {
        if (!payload.pin) throw new Error('informe o PIN');
        await painelApi.criarUsuario({ ...payload, pin: payload.pin });
        setMsg('Usuário criado.');
      }
      setForm(emptyForm);
      setEditId(null);
      list.reload();
    } catch (err) {
      setErro(errorMessage(err, 'Falha ao salvar'));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(u: UsuarioPainel) {
    setEditId(u.id);
    setForm({
      nome: u.nome,
      login: u.login,
      email: u.email || '',
      telefone: u.telefone || '',
      pin: '',
      role: u.role,
      profissional_id: u.profissional_id ? String(u.profissional_id) : '',
      ativo: u.ativo !== false,
    });
    setMsg('');
    setErro('');
  }

  const profissionais = pros.data?.profissionais ?? [];
  const usuarios = list.data?.usuarios ?? [];
  const tituloForm = useMemo(() => (editId ? 'Editar usuário' : 'Novo usuário / funcionário'), [editId]);

  if (list.error) return <Alert kind="error">{list.error}</Alert>;
  if (!list.data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Usuários e funcionários"
        subtitle="Cadastro com papéis. Funcionários veem só a própria agenda e dados (LGPD)."
      />

      {(msg || erro) && <Alert kind={erro ? 'error' : 'success'}>{erro || msg}</Alert>}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>{tituloForm}</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Nome
            <input
              required
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            />
          </label>
          <label>
            Login
            <input
              required
              disabled={Boolean(editId)}
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value.toLowerCase() }))}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label>
            Telefone
            <input
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
            />
          </label>
          <label>
            PIN {editId ? '(deixe vazio para manter)' : ''}
            <input
              type="password"
              inputMode="numeric"
              required={!editId}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
            />
          </label>
          <label>
            Papel
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional vinculado
            <select
              value={form.profissional_id}
              onChange={(e) => setForm((f) => ({ ...f, profissional_id: e.target.value }))}
            >
              <option value="">— nenhum —</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.cargo ? ` (${p.cargo})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
            />
            Ativo
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Salvando…' : editId ? 'Salvar' : 'Cadastrar'}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setForm(emptyForm);
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Papel</th>
                <th>Profissional</th>
                <th>LGPD</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td>{u.login}</td>
                  <td>{u.role}</td>
                  <td>{u.profissional_nome || '—'}</td>
                  <td>{u.lgpd_aceite_em ? `v${u.lgpd_politica_ver || '1'}` : 'pendente'}</td>
                  <td>{u.ativo ? 'ativo' : 'inativo'}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => startEdit(u)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
