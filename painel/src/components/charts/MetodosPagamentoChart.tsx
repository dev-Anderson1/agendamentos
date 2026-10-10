import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { money, tooltipStyle } from './format';

const COLORS: Record<string, string> = {
  pix: '#2c6a4d',
  dinheiro: '#9a6b1a',
  cartao: '#3d5a80',
  transferencia: '#7c3140',
  outro: '#74665a',
};

type Item = {
  metodo: string;
  metodo_label: string;
  quantidade: number;
  total_reais: number;
};

export function MetodosPagamentoChart({ data }: { data: Item[] }) {
  if (!data.length) {
    return <p className="empty">Nenhum pagamento registrado ainda.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total_reais"
          nameKey="metodo_label"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
        >
          {data.map((d) => (
            <Cell key={d.metodo} fill={COLORS[d.metodo] || COLORS.outro} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, _n, item) => {
            const q = (item?.payload as Item | undefined)?.quantidade;
            return [`${money(value)} (${q}×)`, 'Total'];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
