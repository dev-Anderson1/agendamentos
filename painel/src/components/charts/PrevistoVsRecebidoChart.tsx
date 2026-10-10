import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART, money, tooltipStyle } from './format';

type Props = {
  recebido: number;
  previsto: number;
};

export function PrevistoVsRecebidoChart({ recebido, previsto }: Props) {
  const data = [
    { name: 'Recebido', value: Math.max(0, recebido), color: CHART.recebido },
    { name: 'Previsto (futuro)', value: Math.max(0, previsto), color: CHART.previsto },
  ].filter((d) => d.value > 0);

  if (!data.length) {
    return <p className="empty">Sem valores financeiros para comparar.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => money(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
