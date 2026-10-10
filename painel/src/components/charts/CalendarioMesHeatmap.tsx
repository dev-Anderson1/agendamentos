import { money } from './format';

type Dia = {
  dia: string;
  label: string;
  dow: number;
  atendimentos: number;
  previsto_reais: number;
  recebido_reais: number;
  lucro_reais: number;
};

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function isoDay(d: string | Date) {
  const s = String(d).slice(0, 10);
  return Number(s.slice(8, 10));
}

function heatColor(value: number, max: number, mode: 'lucro' | 'atend') {
  if (!value || max <= 0) return 'transparent';
  const t = Math.min(1, value / max);
  if (mode === 'atend') {
    const a = 0.12 + t * 0.75;
    return `rgba(61, 90, 128, ${a})`;
  }
  const a = 0.12 + t * 0.8;
  return `rgba(124, 49, 64, ${a})`;
}

type Props = {
  dias: Dia[];
  modo: 'lucro' | 'atend';
};

export function CalendarioMesHeatmap({ dias, modo }: Props) {
  if (!dias.length) return null;

  const max = Math.max(
    ...dias.map((d) => (modo === 'lucro' ? d.lucro_reais || d.previsto_reais : d.atendimentos)),
    1,
  );

  const firstDow = dias[0]?.dow ?? 0;
  const blanks = Array.from({ length: firstDow }, (_, i) => i);

  return (
    <div className="cal-heat">
      <div className="cal-heat-head">
        {DOW.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="cal-heat-grid">
        {blanks.map((i) => (
          <div key={`b-${i}`} className="cal-cell empty" />
        ))}
        {dias.map((d) => {
          const val = modo === 'lucro' ? d.lucro_reais || d.previsto_reais : d.atendimentos;
          const title =
            modo === 'lucro'
              ? `${d.label}: ${money(d.lucro_reais)} recebido · ${money(d.previsto_reais)} previsto · ${d.atendimentos} atend.`
              : `${d.label}: ${d.atendimentos} atendimentos · ${money(d.previsto_reais)} previsto`;
          return (
            <div
              key={String(d.dia)}
              className="cal-cell"
              title={title}
              style={{ background: heatColor(val, max, modo) }}
            >
              <span className="cal-num">{isoDay(d.dia)}</span>
              {val > 0 && (
                <span className="cal-val">
                  {modo === 'lucro'
                    ? val >= 1000
                      ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`
                      : Math.round(val)
                    : val}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="meta" style={{ marginTop: '0.65rem' }}>
        Cores mais fortes = {modo === 'lucro' ? 'maior receita/lucro' : 'mais atendimentos'} no dia.
      </p>
    </div>
  );
}
