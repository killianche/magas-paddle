// Ограничение частоты запросов с одного адреса — защита от ботов, которые
// забивают расписание фальшивыми заявками или перебирают номера телефонов.
//
// Адрес берём из X-Real-IP: его ставит nginx из настоящего адреса соединения
// (`proxy_set_header X-Real-IP $remote_addr`), подделать его клиент не может.
// X-Forwarded-For для этого не годится — его первый элемент присылает сам клиент.
// Счётчики в памяти: API работает одним экземпляром, после перезапуска они
// обнуляются, и это не страшно.
import { HttpException } from '@nestjs/common';

const hits = new Map<string, number[]>();
let sweptAt = 0;

/** Настоящий адрес клиента. */
export function ipOf(req: { headers?: Record<string, any>; socket?: { remoteAddress?: string } }): string {
  const real = String(req.headers?.['x-real-ip'] ?? '').trim();
  return real || req.socket?.remoteAddress || 'неизвестно';
}

/** Засчитать запрос; если за окно их больше limit — ответить 429 с текстом. */
export function limitRate(key: string, limit: number, windowMs: number, message: string) {
  const now = Date.now();
  if (now - sweptAt > 10 * 60_000) {
    sweptAt = now;
    for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > 24 * 3600_000) hits.delete(k);
  }
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    throw new HttpException(message, 429);
  }
  list.push(now);
  hits.set(key, list);
}
