// Контакты клуба в одном месте. Всё, чего клуб ещё не дал, здесь равно null —
// экраны сами показывают такие пункты как незаполненные и не выдумывают значение.
// Правило «не додумывать» — CLAUDE.md.

export const CLUB = {
  name: 'Magas Padel',
  city: 'Магас',
  region: 'Республика Ингушетия',

  /** Точка на карте — прислана заказчиком. Первая ссылка указывала чуть мимо,
      это уточнённая: 43.184968, 44.816118. */
  point: { lat: 43.184968, lon: 44.816118 },

  /** Короткая ссылка заказчика: на телефоне открывает приложение Яндекс.Карт. */
  mapUrl: 'https://yandex.ru/maps/-/CTdnmJ8N',

  instagram: 'https://www.instagram.com/padel_magas/',

  /** ЗАГЛУШКА: номер WhatsApp заказчик пришлёт отдельно (вопрос Q46).
      Как только он появится — вписать сюда только цифры, кнопка заработает сама. */
  whatsapp: null as string | null,

  /** ЗАГЛУШКА: точный адрес клуб ещё не назвал (вопрос Q41). */
  address: null as string | null,

  /** ЗАГЛУШКА: телефон клуба заказчик ещё не дал (вопрос Q45). */
  phone: null as string | null,

  /** Политика конфиденциальности. Адрес выдан Apple при подаче приложения. */
  privacyUrl: 'https://padel.217-114-8-196.sslip.io/privacy.html',
} as const;

/** Ссылка на WhatsApp по номеру. null, пока номер не известен. */
export function whatsappUrl(): string | null {
  return CLUB.whatsapp ? `https://wa.me/${CLUB.whatsapp}` : null;
}

/** Координаты человеку — на случай, если карты не открылись. */
export const pointText =
  `${CLUB.point.lat.toFixed(5)}, ${CLUB.point.lon.toFixed(5)}`;
