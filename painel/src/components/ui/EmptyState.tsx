export function EmptyState({ children }: { children: string }) {
  return <p className="empty">{children}</p>;
}

export function Loading({ children = 'Carregando…' }: { children?: string }) {
  return <p className="empty">{children}</p>;
}
