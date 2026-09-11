// Прокат ракеток и мячи — из текста, который клуб пишет в админке.
//
// Формат простой, чтобы менеджер не путался: строка с двоеточием на конце —
// заголовок, «Название — цена» — пункт с ценой, остальное — пометка
// («Можно свои»). Маркеры «•», «-» в начале строки не мешают.

export type RentalItem = { name: string; price: string | null };
export type RentalGroup = { title: string | null; items: RentalItem[] };

export function parseRentals(text: string | null | undefined): RentalGroup[] {
  const groups: RentalGroup[] = [];
  let cur: RentalGroup | null = null;
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/^[\s•·*\-–—]+/, '').trim();
    if (!line) continue;
    if (line.endsWith(':')) {
      cur = { title: line.slice(0, -1).trim(), items: [] };
      groups.push(cur);
      continue;
    }
    if (!cur) { cur = { title: null, items: [] }; groups.push(cur) }
    const m = line.match(/^(.*?)\s+[—–-]\s+(.*\d.*)$/);
    cur.items.push(m ? { name: m[1].trim(), price: m[2].trim() } : { name: line, price: null });
  }
  return groups.filter(g => g.items.length > 0);
}

/** Самая низкая цена в списке, «100 ₽»; null — цен нет. */
export function cheapest(groups: RentalGroup[]): string | null {
  const nums = groups.flatMap(g => g.items)
    .map(i => i.price ? Number(i.price.replace(/[^\d]/g, '')) : NaN)
    .filter(n => n > 0);
  return nums.length ? `${Math.min(...nums).toLocaleString('ru-RU')} ₽` : null;
}

/** Есть ли пометка «можно свои». */
export const ownAllowed = (groups: RentalGroup[]) =>
  groups.some(g => g.items.some(i => !i.price && /сво/i.test(i.name)));
