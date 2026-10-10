import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, money, moneyShort, tooltipStyle } from './format';

type Row = {
  nome: string;
  recebido_reais: number;
  previsto_reais: number;
  total_agendamentos: number;
};

export function ServicosChart({ data }: { data: Row[] }) {
  const top = [...data]
    .sort((a, b) => b.recebido_reais + b.previsto_reais - (a.recebido_reais + a.previsto_reais))
    .slice(0, 8)
    .map((s) => ({
      ...s,
      label: s.nome.length > 18 ? `${s.nome.slice(0, 16)}…` : s.nome,
    }));

  if (!top.length) {
    return <p className="empty">Sem dados de serviços no período.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 36)}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} horizontal={false} />
        <XAxis type="number" tickFormatter={moneyShort} tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={110} tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [
            money(value),
            name === 'recebido_reais' ? 'Recebido' : 'Previsto',
          ]}
        />
        <Legend
          formatter={(value) => (value === 'recebido_reais' ? 'Recebido' : 'Previsto')}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="recebido_reais" stackId="a" fill={CHART.recebido} radius={[0, 0, 0, 0]} />
        <Bar dataKey="previsto_reais" stackId="a" fill={CHART.previsto} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
