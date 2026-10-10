import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, money, moneyShort, tooltipStyle } from './format';

type Point = { mes: string; recebido_reais: number; pagamentos?: number };

export function ReceitaMensalChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <p className="empty">Sem pagamentos registrados ainda.</p>;
  }

  const rows = data.map((d) => ({
    ...d,
    label: d.mes.length >= 7 ? d.mes.slice(5) : d.mes,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={moneyShort} tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number) => [money(value), 'Recebido']}
          labelFormatter={(label) => `Mês ${label}`}
        />
        <Bar dataKey="recebido_reais" fill={CHART.recebido} radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
