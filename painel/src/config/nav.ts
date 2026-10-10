import type { Role } from '../types';

export type NavItem = {
  to: string;
  label: string;
  short: string;
  /** Se vazio, todos autenticados. */
  roles?: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', roles: ['admin', 'funcionario'] },
  { to: '/agenda', label: 'Agenda', short: 'Agenda', roles: ['admin', 'funcionario'] },
  { to: '/agendar', label: 'Novo agendamento', short: 'Novo', roles: ['admin', 'funcionario'] },
  { to: '/meu-perfil', label: 'Meu perfil', short: 'Perfil' },
  { to: '/usuarios', label: 'Usuários', short: 'Users', roles: ['admin'] },
  { to: '/consumo', label: 'Consumo IA/Meta', short: 'Custo', roles: ['admin'] },
  { to: '/whatsapp', label: 'WhatsApp', short: 'WA', roles: ['admin'] },
  { to: '/privacidade', label: 'Privacidade', short: 'LGPD', roles: ['admin'] },
  { to: '/financeiro', label: 'Financeiro', short: '$$', roles: ['admin'] },
  { to: '/relatorios', label: 'Relatórios', short: 'Rel', roles: ['admin', 'funcionario'] },
  { to: '/estoque', label: 'Estoque', short: 'Est', roles: ['admin'] },
];

export function navForRole(role: Role | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
