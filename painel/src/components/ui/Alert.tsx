type Props = {
  children: string;
  kind?: 'error' | 'success' | 'info';
};

export function Alert({ children, kind = 'info' }: Props) {
  if (!children) return null;
  return (
    <p className={kind === 'error' ? 'error' : 'alert'} data-kind={kind} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
