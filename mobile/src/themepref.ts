// Какую тему выбрал человек: тёмную, светлую или как в телефоне.
//
// Выбор хранится на устройстве. Системным окнам (клавиатура, подтверждения)
// сообщаем его же через Appearance — иначе в светлом приложении выезжала бы
// тёмная клавиатура и наоборот.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

export type ThemePref = 'dark' | 'light' | 'system';

const KEY = 'magas.theme.v1';
let pref: ThemePref = 'dark';
const subs = new Set<() => void>();

function tellSystem() {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  // 'unspecified' — снова следовать настройке телефона
  Appearance.setColorScheme((pref === 'system' ? 'unspecified' : pref) as any);
}

/** Прочитать сохранённый выбор. Зовётся один раз при запуске. */
export async function loadThemePref(): Promise<ThemePref> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') pref = v;
  } catch {}
  tellSystem();
  subs.forEach(f => f());
  return pref;
}

export function setThemePref(p: ThemePref) {
  pref = p;
  AsyncStorage.setItem(KEY, p).catch(() => {});
  tellSystem();
  subs.forEach(f => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } };
const get = () => pref;

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, get, get);
}
