// Имя и телефон человека. Входа в приложении нет — по номеру сервер и узнаёт,
// чьи это записи. Храним на устройстве, никуда больше не отправляем.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'magas.profile.v1';

export type Profile = { name: string; phone: string };

let cache: Profile | null = null;
const listeners = new Set<() => void>();

export async function loadProfile(): Promise<Profile | null> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch { cache = null }
  return cache;
}

export async function saveProfile(p: Profile) {
  cache = p;
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  listeners.forEach(l => l());
}

/** Приводим к виду, который понимает сервер: +7XXXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) return '+7' + digits.slice(1);
  if (digits.length === 10) return '+7' + digits;
  if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
  return null;
}

/** Показываем номер так, как человек привык его видеть. */
export function prettyPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `+7 ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9)}`;
  return phone;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(cache);
  const [ready, setReady] = useState(cache != null);

  useEffect(() => {
    let alive = true;
    loadProfile().then(p => { if (alive) { setProfile(p); setReady(true) } });
    const l = () => setProfile(cache);
    listeners.add(l);
    return () => { alive = false; listeners.delete(l) };
  }, []);

  const save = useCallback(async (p: Profile) => { await saveProfile(p); setProfile(p) }, []);
  return { profile, ready, save };
}
