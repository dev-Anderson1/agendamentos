type Tab<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  tabs: readonly Tab<T>[] | Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  children?: React.ReactNode;
};

export function Tabs<T extends string>({ tabs, value, onChange, children }: Props<T>) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id || 'all'}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={value === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {children}
    </div>
  );
}
