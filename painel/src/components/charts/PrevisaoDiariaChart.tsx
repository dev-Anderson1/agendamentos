import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, money, moneyShort, tooltipStyle } from './format';

type Point = { dia: string; agendamentos: number; previsto_reais: number };

function labelDia(dia: string) {
  const d = new Date(String(dia));
  if (Number.isNaN(d.getTime())) return String(dia);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function PrevisaoDiariaChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <p className="empty">Nenhum agendamento futuro com valor previsto.</p>;
  }

  const rows = data.map((d) => ({
    ...d,
    label: labelDia(d.dia),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="prevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.previsto} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART.previsto} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={moneyShort} tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => {
            if (name === 'previsto_reais') return [money(value), 'Previsto'];
            return [value, 'Agendamentos'];
          }}
        />
        <Area
          type="monotone"
          dataKey="previsto_reais"
          stroke={CHART.previsto}
          fill="url(#prevFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
