import { FormEvent, useState } from 'react';
import { painelApi } from '../api/services';
import { Badge } from '../components/ui/Badge';
import { EmptyState, Loading } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { errorMessage, moneyFromCents } from '../lib/format';
import type { Produto } from '../types';

export function EstoquePage() {
  const { notify } = useToast();
  const produtosQ = useQuery(() => painelApi.produtos(), []);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalMov, setModalMov] = useState<Produto | null>(null);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [qtdMov, setQtdMov] = useState('');
  const [tipoMov, setTipoMov] = useState('entrada');
  const [busy, setBusy] = useState(false);

  const produtos = produtosQ.data?.produtos ?? [];

  async function criarProduto(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await painelApi.criarProduto(nome.trim(), categoria.trim() || null);
      setModalNovo(false);
      setNome('');
      setCategoria('');
      notify('Produto criado.', 'success');
      produtosQ.reload();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function registrarMovimento(e: FormEvent) {
    e.preventDefault();
    if (!modalMov) return;
    setBusy(true);
    try {
      await painelApi.movimentarEstoque(modalMov.id, tipoMov, Number(qtdMov));
      setModalMov(null);
      setQtdMov('');
      notify('Movimento registrado.', 'success');
      produtosQ.reload();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Estoque" subtitle="Produtos e movimentações — base para o site futuro." />

      <div className="acoes" style={{ marginBottom: '1rem' }}>
        <button type="button" className="primary" onClick={() => setModalNovo(true)}>
          Novo produto
        </button>
        <button type="button" onClick={produtosQ.reload} disabled={produtosQ.loading}>
          Atualizar
        </button>
      </div>

      {produtosQ.error && <p className="error">{produtosQ.error}</p>}

      {produtosQ.loading ? (
        <Loading />
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Estoque</th>
                <th>Mínimo</th>
                <th>Custo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nome}
                    {p.baixo && (
                      <>
                        {' '}
                        <Badge tone="baixo">baixo</Badge>
                      </>
                    )}
                    {p.categoria && <div className="meta">{p.categoria}</div>}
                  </td>
                  <td>
                    {p.estoque_atual} {p.unidade}
                  </td>
                  <td>
                    {p.estoque_minimo} {p.unidade}
                  </td>
                  <td>{moneyFromCents(p.custo_centavos)}</td>
                  <td>
                    <button type="button" onClick={() => setModalMov(p)}>
                      Movimentar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!produtos.length && <EmptyState>Nenhum produto cadastrado.</EmptyState>}
        </div>
      )}

      <Modal
        open={modalNovo}
        title="Novo produto"
        onClose={() => setModalNovo(false)}
        actions={
          <>
            <button type="button" onClick={() => setModalNovo(false)}>
              Cancelar
            </button>
            <button type="submit" form="form-produto" className="primary" disabled={busy}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-produto" onSubmit={criarProduto}>
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} required style={{ marginTop: '0.35rem' }} />
          </label>
          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            Categoria
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ marginTop: '0.35rem' }} />
          </label>
        </form>
      </Modal>

      <Modal
        open={!!modalMov}
        title={`Movimentar — ${modalMov?.nome ?? ''}`}
        onClose={() => setModalMov(null)}
        actions={
          <>
            <button type="button" onClick={() => setModalMov(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-mov" className="primary" disabled={busy}>
              Registrar
            </button>
          </>
        }
      >
        <form id="form-mov" onSubmit={registrarMovimento}>
          <label>
            Tipo
            <select value={tipoMov} onChange={(e) => setTipoMov(e.target.value)} style={{ marginTop: '0.35rem' }}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="uso_servico">Uso em serviço</option>
              <option value="venda">Venda</option>
              <option value="perda">Perda</option>
            </select>
          </label>
          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            Quantidade
            <input
              type="number"
              min="0.001"
              step="any"
              value={qtdMov}
              onChange={(e) => setQtdMov(e.target.value)}
              required
              style={{ marginTop: '0.35rem' }}
            />
          </label>
        </form>
      </Modal>
    </>
  );
}
