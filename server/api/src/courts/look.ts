// Цвет покрытия и особенности корта — как их задаёт клуб в админке.
//
// Цвет выбирается из списка, а не вписывается кодом: так в приложении
// всегда есть и название («Синий»), и оттенок для метки. Список — ровно те
// цвета, что назвал заказчик; понадобится ещё один — добавляется строкой здесь,
// и он сразу появится в админке.

export const COURT_COLORS: Record<string, { name: string; hex: string }> = {
  green: { name: 'Зелёный', hex: '#2E9A55' },
  blue:  { name: 'Синий',   hex: '#2F6FD0' },
};

export type CourtColor = { key: string; name: string; hex: string };

export function colorOf(key: string | null | undefined): CourtColor | null {
  const c = key ? COURT_COLORS[key] : undefined;
  return c && key ? { key, ...c } : null;
}

export const colorList = (): CourtColor[] =>
  Object.entries(COURT_COLORS).map(([key, c]) => ({ key, ...c }));

/** Особенности: «Ультраширокий, Одиночный» → два ярлыка.
 *  Не больше четырёх и коротко — ярлык должен влезать на карточку. */
export function cleanTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : String(v ?? '').split(',');
  const out: string[] = [];
  for (const t of raw) {
    const s = t.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 4);
}
