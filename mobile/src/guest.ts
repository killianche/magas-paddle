// «Посмотреть без входа»: человек отказался входить при запуске.
//
// Приложение открывается экраном входа по номеру, как в крупных сервисах
// (заказчик, 08.10.2026). Но смотреть цены и свободные часы можно и без
// аккаунта — иначе Apple отклоняет по правилу 5.1.1(v), да и человеку
// незачем регистрироваться, чтобы просто узнать, во сколько открыт клуб.
// Нажал «Посмотреть без входа» — больше не спрашиваем, пока не выйдет
// из аккаунта или не переустановит приложение.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'magas.guest';

let cache: boolean | null = null;

export async function loadGuest(): Promise<boolean> {
  if (cache !== null) return cache;
  try { cache = (await AsyncStorage.getItem(KEY)) === '1' } catch { cache = false }
  return cache;
}

export async function setGuest(on: boolean) {
  cache = on;
  try {
    if (on) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}
