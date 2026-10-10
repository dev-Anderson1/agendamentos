import { NavLink } from 'react-router-dom';
import erikaFoto from '../../assets/erika-thebas.png';
import { STUDIO_NOME } from '../../config/constants';
import { navForRole } from '../../config/nav';
import { useAuth } from '../../context/AuthContext';

type Props = {
  onNavigate: () => void;
};

export function Sidebar({ onNavigate }: Props) {
  const { logout, role, usuario } = useAuth();
  const items = navForRole(role);

  return (
    <aside className="sidebar" aria-label="Menu principal">
      <div className="sidebar-brand">
        <img
          className="sidebar-avatar"
          src={erikaFoto}
          alt={STUDIO_NOME}
          width={56}
          height={56}
          decoding="async"
        />
        <div className="sidebar-brand-text">
          <h1>{STUDIO_NOME}</h1>
          <p>{usuario?.nome || 'Painel'}</p>
        </div>
      </div>

      <nav className="nav">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} title={item.label} onClick={onNavigate}>
            <span className="nav-full">{item.label}</span>
            <span className="nav-short">{item.short}</span>
          </NavLink>
        ))}
      </nav>

      <button type="button" className="sidebar-sair" onClick={logout} title="Sair">
        <span className="nav-full">Sair</span>
        <span className="nav-short">Sair</span>
      </button>
    </aside>
  );
}
