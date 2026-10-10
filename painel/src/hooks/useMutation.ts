import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/format';

export function useMutation<TArgs = void, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mutate = useCallback(
    async (args?: TArgs) => {
      setBusy(true);
      setError('');
      try {
        return await fn(args as TArgs);
      } catch (err) {
        const msg = errorMessage(err);
        setError(msg);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );

  return { mutate, busy, error, setError };
}
