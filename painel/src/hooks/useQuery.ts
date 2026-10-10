import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { errorMessage } from '../lib/format';

type QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
};

export function useQuery<T>(fetcher: () => Promise<T>, deps: DependencyList, enabled = true) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: enabled,
    error: '',
  });
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));

    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: '' });
      })
      .catch((err) => {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  return { ...state, reload };
}
