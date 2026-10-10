import { type ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
};

export function StatCard({ label, value, hint }: Props) {
  return (
    <article className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="meta">{hint}</div> : null}
    </article>
  );
}
