// Загрузка данных с сервера с тремя состояниями: ждём, получили, не вышло.
// Экраны не пишут это заново — иначе в каждом будет свой набор ошибок.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

export type Query<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Обновление уже показанных данных: экран не мигает пустотой. */
  refreshing: boolean;
  reload: () => void;
  refresh: () => void;
};

export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (soft: boolean) => {
    soft ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fn();
      setData(res); setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось загрузить. Попробуйте ещё раз.');
    } finally {
      soft ? setRefreshing(false) : setLoading(false);
    }
    // fn меняется вместе с deps, поэтому в зависимостях именно они
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(false) }, [run]);

  return {
    data, error, loading, refreshing,
    reload: () => run(false),
    refresh: () => run(true),
  };
}
