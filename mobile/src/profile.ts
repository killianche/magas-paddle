// Имя и телефон человека. Входа в приложении нет — по номеру сервер и узнаёт,
// чьи это записи. Храним на устройстве, никуда больше не отправляем.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { setToken, setUnauthorizedHandler } from './api';

const KEY = 'magas.profile.v1';
const TOKEN_KEY = 'magas.token.v1';

/** phone — тот номер, по которому клуб и сервер узнают человека.
 *  whatsapp — второй номер, если он другой. Обязателен хотя бы один: если
 *  дан только WhatsApp, он и становится основным. */
export type Profile = {
  /** ID аккаунта в клубе. Известен после входа или первой заявки. */
  id?: number;
  name: string; surname?: string; phone: string; whatsapp?: string;
  /** Стоит ли на аккаунте пароль. Пока нет — приложение зовёт его завести. */
  hasPassword?: boolean;
};

/** Две буквы для кружка аккаунта: «АМ» или, если фамилии нет, «А». */
export const initials = (p: Profile) =>
  [p.name, p.surname].filter(Boolean).map(x => x!.trim()[0] ?? '').join('').toUpperCase();

/** Как человека зовут одной строкой — это и уходит клубу вместе с заявкой. */
export const fullName = (p: Profile) =>
  [p.name, p.surname].filter(Boolean).join(' ').trim();

let cache: Profile | null = null;
/** Вошёл ли человек на самом деле. Имя и телефон на устройстве могли
 *  остаться от старых версий, когда запись шла без аккаунта. */
let signedIn = false;
const listeners = new Set<() => void>();

export const isSignedIn = () => signedIn;

// Сервер сказал «войдите» — вход больше не действует
setUnauthorizedHandler(() => {
  if (!signedIn) return;
  signedIn = false;
  setToken(null);
  AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  listeners.forEach(l => l());
});

export async function loadProfile(): Promise<Profile | null> {
  if (cache) return cache;
  try {
    const [raw, tok] = await Promise.all([
      AsyncStorage.getItem(KEY), AsyncStorage.getItem(TOKEN_KEY),
    ]);
    cache = raw ? JSON.parse(raw) : null;
    setToken(tok);
    signedIn = !!tok;
  } catch { cache = null }
  return cache;
}

/** Вошли: запоминаем токен и на устройстве, и в слое связи с сервером. */
export async function saveToken(t: string | null) {
  setToken(t);
  signedIn = !!t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
  listeners.forEach(l => l());
}

/** Выход: с устройства уходит всё, включая имя. */
export async function forgetProfile() {
  cache = null;
  signedIn = false;
  setToken(null);
  await Promise.all([AsyncStorage.removeItem(KEY), AsyncStorage.removeItem(TOKEN_KEY)]);
  listeners.forEach(l => l());
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

/** Номер подряд, без пробелов и чёрточек — так его набирают и вставляют
 *  в поля. Приложение одинаково понимает 8… и 7…, поэтому вид один. */
export function plainPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Показываем номер так, как человек привык его видеть. */
export function prettyPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `+7 ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9)}`;
  return phone;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(cache);
  const [signed, setSigned] = useState(signedIn);
  const [ready, setReady] = useState(cache != null);

  useEffect(() => {
    let alive = true;
    loadProfile().then(p => { if (alive) { setProfile(p); setSigned(signedIn); setReady(true) } });
    const l = () => { setProfile(cache); setSigned(signedIn) };
    listeners.add(l);
    return () => { alive = false; listeners.delete(l) };
  }, []);

  const save = useCallback(async (p: Profile) => {
    await saveProfile(p); setProfile(p); setSigned(signedIn);
  }, []);
  const forget = useCallback(async () => { await forgetProfile(); setProfile(null); setSigned(false) }, []);
  /** signedIn — вход действительно выполнен. Профиль без входа значит только,
   *  что имя и телефон помним с прошлого раза. */
  return { profile, ready, save, forget, signedIn: signed };
}
