export function money(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function moneyShort(v: number) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) {
    return `R$ ${(n / 1000).toFixed(1)}k`;
  }
  return money(n);
}

export const CHART = {
  accent: '#7c3140',
  ok: '#2c6a4d',
  warn: '#9a6b1a',
  muted: '#74665a',
  line: '#e4d8cc',
  previsto: '#a67c52',
  recebido: '#7c3140',
  agendamentos: '#3d5a80',
};

export const tooltipStyle = {
  background: '#fffcf8',
  border: '1px solid #e4d8cc',
  borderRadius: 12,
  fontSize: 13,
};
