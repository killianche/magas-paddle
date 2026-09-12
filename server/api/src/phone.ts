// Один вид номера для всей системы.
//
// Менеджер набирает «928 000 11 22», приложение шлёт «+79280001122» —
// без приведения к общему виду это два разных клиента, и история визитов
// с отменами расходится. Правило простое: 11 цифр, всегда начинается с 7.

/** Приводит номер к виду 79280001122. null — если это не российский номер. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;             // набрали без кода страны
  return d.length === 11 && d.startsWith('7') ? d : null;
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
  if (d.length !== 11) return d;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}
