import { BadRequestException } from '@nestjs/common';
// Один вид номера для всей системы.
//
// Менеджер набирает «928 000 11 22», приложение шлёт «+79280001122» —
// без приведения к общему виду это два разных клиента, и история визитов
// с отменами расходится. Правило простое: 11 цифр, всегда начинается с 7.

/** Приводит номер к виду 79280001122. Зарубежные номера принимаются как есть,
 *  цифрами с кодом страны (заказчик, 17.09.2026: «принимать»). null — если это
 *  вообще не похоже на телефон. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;             // набрали без кода страны
  if (d.length === 11 && d.startsWith('7')) return d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Цифры для поиска по номеру: «89289204029» и «79289204029» — один и тот же
 *  человек, и у стойки набирают как привыкли. Частичный ввод («9204») остаётся
 *  как есть: по нему ищут кусок номера. */
export function searchDigits(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  if (d.length === 10) return '7' + d;
  return d;
}

/** Читаемый вид для экрана: +7 928 000-11-22. */
export function prettyPhone(normalized: string): string {
  const d = normalized;
  if (d.length !== 11 || !d.startsWith('7')) return '+' + d;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

/** «ID 12», «id12», «ID: 12» — ID аккаунта из сообщения WhatsApp.
 *  Просто «12» — это номер заявки, поэтому без «ID» не считается. */
export function accountIdOf(raw: string | null | undefined): bigint | null {
  const m = String(raw ?? '').trim().match(/^id\s*[:№#]?\s*(\d{1,12})$/i);
  return m ? BigInt(m[1]) : null;
}

/** ID из адреса запроса. Раньше «abc» падало в BigInt и отдавало 500. */
export function bigId(v: unknown): bigint {
  const str = String(v ?? '');
  if (!/^\d{1,15}$/.test(str)) throw new BadRequestException('Неверный номер записи');
  return BigInt(str);
}
