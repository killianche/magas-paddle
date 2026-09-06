// Контакты клуба в одном месте. Всё, чего клуб ещё не дал, здесь равно null —
// экраны сами показывают такие пункты как незаполненные и не выдумывают значение.
// Правило «не додумывать» — CLAUDE.md.

export const CLUB = {
  name: 'Magas Padel',
  city: 'Магас',
  region: 'Республика Ингушетия',

  /** Точка на карте — прислана заказчиком ссылкой на Яндекс.Карты. */
  point: { lat: 43.185020, lon: 44.816118 },

  /** Короткая ссылка заказчика: на телефоне открывает приложение Яндекс.Карт. */
  mapUrl: 'https://yandex.ru/maps/-/CTdynK7Q',

  instagram: 'https://www.instagram.com/padel_magas/',

  /** ЗАГЛУШКА: номер WhatsApp заказчик пришлёт отдельно (вопрос Q46).
      Как только он появится — вписать сюда только цифры, кнопка заработает сама. */
  whatsapp: null as string | null,

  /** ЗАГЛУШКА: точный адрес клуб ещё не назвал (вопрос Q41). */
  address: null as string | null,
} as const;

/** Ссылка на WhatsApp по номеру. null, пока номер не известен. */
export function whatsappUrl(): string | null {
  return CLUB.whatsapp ? `https://wa.me/${CLUB.whatsapp}` : null;
}

/** Координаты человеку — на случай, если карты не открылись. */
export const pointText =
  `${CLUB.point.lat.toFixed(5)}, ${CLUB.point.lon.toFixed(5)}`;
