import { TIMEZONE } from '../config/constants';

function nowInTimezone(tz = TIMEZONE) {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

export function hojeIso(tz = TIMEZONE) {
  const sp = nowInTimezone(tz);
  const y = sp.getFullYear();
  const m = String(sp.getMonth() + 1).padStart(2, '0');
  const day = String(sp.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mesAtual(tz = TIMEZONE) {
  const sp = nowInTimezone(tz);
  return `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}`;
}

export function labelMes(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function formatDateTimeBr(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}
