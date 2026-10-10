import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, money, moneyShort, tooltipStyle } from './format';

type Dia = {
  label: string;
  atendimentos: number;
  previsto_reais: number;
  recebido_reais: number;
  lucro_reais: number;
};

export function DiarioMesChart({ data }: { data: Dia[] }) {
  const rows = data.filter((d) => d.atendimentos > 0 || d.recebido_reais > 0 || d.previsto_reais > 0);
  if (!rows.length) {
    return <p className="empty">Nenhum atendimento neste mês ainda.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="reais"
          tickFormatter={moneyShort}
          tick={{ fill: CHART.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <YAxis
          yAxisId="qtd"
          orientation="right"
          allowDecimals={false}
          tick={{ fill: CHART.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => {
            if (name === 'atendimentos') return [value, 'Atendimentos'];
            if (name === 'previsto_reais') return [money(value), 'Previsto'];
            return [money(value), 'Recebido / lucro'];
          }}
        />
        <Legend
          formatter={(v) =>
            v === 'atendimentos' ? 'Atendimentos' : v === 'previsto_reais' ? 'Previsto' : 'Recebido'
          }
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar yAxisId="reais" dataKey="recebido_reais" fill={CHART.recebido} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar yAxisId="reais" dataKey="previsto_reais" fill={CHART.previsto} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Line
          yAxisId="qtd"
          type="monotone"
          dataKey="atendimentos"
          stroke={CHART.agendamentos}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
