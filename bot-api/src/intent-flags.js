function norm(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/** Pedidos de agenda viva (marcar / ver horário / cancelar) — não vão para RAG. */
export function isPedidoOperacional(texto = '') {
  const t = norm(texto);

  if (
    /\b(como|politica|posso|da pra|da para|aceita|aceitam|qual|quais)\b/.test(t) &&
    /\b(remarcar|cancelar|pix|pagar|pagamento|endereco|estacionamento|atraso)\b/.test(t)
  ) {
    return false;
  }

  return /\b(quero (agendar|marcar|remarcar)|gostaria de agendar|quero marcar|agendar|marcar (um )?horario|marcar pra|tem horario|tem vaga|horario livre|disponib|meu(s)? horario|cancelar meu|desmarcar meu|cancela o|quero um horario|remarcar|desmarcar)\b/.test(
    t,
  );
}

/** "quero/sim/não" — continua a última oferta, sem LLM. */
export function isContinuacaoCurta(texto = '') {
  return /^(quero|sim|nao|n|ok|isso|pode|mostra|mostrar|claro|vamos|por favor|quero sim|pode ser)$/.test(
    norm(texto),
  );
}

/** Catálogo / equipe: responde na hora pelo fluxo clássico. */
export function isPedidoCatalogo(texto = '') {
  const t = norm(texto);
  return (
    /\b(profissional(es)?|equipe|quem (atende|faz|sao)|o que (fazem|cada))\b/.test(t) ||
    /\b(servicos|serviços|precos|preços|quanto custa|tabela)\b/.test(t)
  );
}
