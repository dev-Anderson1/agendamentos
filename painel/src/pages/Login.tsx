import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STUDIO_NOME } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/format';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await login(usuario, pin);
      setPin('');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = errorMessage(err, 'Acesso inválido');
      setErro(msg === 'pin_invalido' ? 'Login ou PIN incorreto' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={onSubmit}>
        <h1>Painel do studio</h1>
        <p>
          Entre com seu login e PIN. Admin: <code>admin</code> + PIN do studio. {STUDIO_NOME}
        </p>
        <input
          type="text"
          autoComplete="username"
          placeholder="Login (ex.: admin)"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value.trim())}
          autoFocus
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\s/g, ''))}
          style={{ marginTop: '0.75rem' }}
        />
        {erro && <p className="error">{erro}</p>}
        <button
          type="submit"
          className="primary"
          disabled={loading || !pin}
          style={{ width: '100%', marginTop: '1rem' }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Compatível: só o PIN do admin também funciona (campo login vazio).
        </p>
      </form>
    </div>
  );
}
