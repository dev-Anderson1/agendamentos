export function money(reais: number) {
  return Number(reais || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function moneyFromCents(centavos: number | null | undefined) {
  return money(Number(centavos || 0) / 100);
}

export function moneyShort(reais: number) {
  const n = Number(reais || 0);
  if (Math.abs(n) >= 1000) {
    return `R$ ${(n / 1000).toFixed(1)}k`;
  }
  return money(n);
}

export function parseValorBr(valor: string) {
  const n = parseFloat(valor.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function errorMessage(err: unknown, fallback = 'Algo deu errado') {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
