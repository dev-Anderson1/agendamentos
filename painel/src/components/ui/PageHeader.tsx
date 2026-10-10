import { type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: ReactNode;
};

export function PageHeader({ title, subtitle }: Props) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-sub">{subtitle}</p> : null}
    </header>
  );
}
