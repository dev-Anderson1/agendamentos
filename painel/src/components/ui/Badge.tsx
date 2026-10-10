type Props = {
  children: string;
  tone?: 'pendente' | 'pago' | 'cancelado' | 'baixo';
};

export function Badge({ children, tone }: Props) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}
