// Загрузка данных с сервера.
//
// Главное здесь — не скорость сети, а ощущение. Раньше каждый вход на экран
// показывал крутилку с нуля, даже если те же данные показывались минуту назад.
// Теперь показанное сохраняется на устройстве и при следующем открытии
// рисуется сразу, а свежее подтягивается фоном и молча заменяет старое.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api';

export type Query<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Обновление уже показанных данных: экран не мигает пустотой. */
  refreshing: boolean;
  /** Данные с прошлого раза, свежие ещё едут. */
  stale: boolean;
  reload: () => void;
  refresh: () => void;
};

const PREFIX = 'magas.cache.';
/** Старше этого сохранённое не показываем: лучше крутилка, чем вчерашний день. */
const MAX_AGE_MS = 12 * 3600_000;

export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  /** Ключ хранения. Без него ничего не сохраняется — так у экранов,
   *  где показывать старое нельзя. Ключ должен включать дату, если данные
   *  зависят от дня: иначе завтра покажется вчерашнее. */
  cacheKey?: string,
): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  // Чтобы поздний ответ по старому ключу не перезаписал новый экран
  const gen = useRef(0);

  const run = useCallback(async (soft: boolean) => {
    const my = ++gen.current;
    soft ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fn();
      if (my !== gen.current) return;
      setData(res); setError(null); setStale(false);
      if (cacheKey) {
        AsyncStorage.setItem(PREFIX + cacheKey,
          JSON.stringify({ at: Date.now(), data: res })).catch(() => {});
      }
    } catch (e) {
      if (my !== gen.current) return;
      setError(e instanceof ApiError ? e.message : 'Не получилось загрузить. Попробуйте ещё раз.');
    } finally {
      if (my === gen.current) soft ? setRefreshing(false) : setLoading(false);
    }
    // fn меняется вместе с deps, поэтому в зависимостях именно они
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps.concat(cacheKey));

  useEffect(() => {
    let alive = true;
    setStale(false);

    if (!cacheKey) { run(false); return () => { alive = false } }

    // Сохранённое показываем сразу, не дожидаясь сети, и тут же идём за свежим
    AsyncStorage.getItem(PREFIX + cacheKey).then(raw => {
      if (!alive) return;
      let shown = false;
      if (raw) {
        try {
          const box = JSON.parse(raw);
          if (box && Date.now() - box.at < MAX_AGE_MS) {
            setData(box.data as T);
            setLoading(false);
            setStale(true);
            shown = true;
          }
        } catch {}
      }
      run(shown);   // есть что показать — обновляем мягко, нет — обычной загрузкой
    }).catch(() => { if (alive) run(false) });

    return () => { alive = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return {
    data, error, loading, refreshing, stale,
    reload: () => run(false),
    refresh: () => run(true),
  };
}
