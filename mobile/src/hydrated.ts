import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Статический экспорт для веба рендерит страницу на сервере, где адресной строки
 * ещё нет — параметры приходят только в браузере. Если сразу рисовать по ним,
 * разметка расходится с серверной и React ругается ошибкой гидрации (#418).
 * Ждём монтирования и до него показываем нейтральный каркас.
 * На устройстве этого этапа нет — там сразу true.
 */
export function useHydrated() {
  const [ok, setOk] = useState(Platform.OS !== 'web');
  useEffect(() => { if (!ok) setOk(true) }, [ok]);
  return ok;
}
