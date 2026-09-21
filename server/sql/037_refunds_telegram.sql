-- Возвраты и уведомления руководителю в Telegram (заказчик, 21.09.2026).

-- Журнал возвратов. Возврат по брони уже виден в payments минусом, а вот
-- возврат покупки раньше просто удалял строку продажи — следа не оставалось.
-- Теперь каждый возврат записан: что, сколько, кому и кто вернул.
CREATE TABLE IF NOT EXISTS refunds (
  id          bigserial PRIMARY KEY,
  kind        text        NOT NULL,              -- 'sale' | 'booking'
  sale_id     bigint,                            -- строка продажи, которой уже нет
  booking_id  bigint      REFERENCES bookings(id) ON DELETE SET NULL,
  client_id   bigint      REFERENCES clients(id) ON DELETE SET NULL,
  amount      integer     NOT NULL,              -- копейки, всегда положительное
  method      text        NOT NULL DEFAULT 'cash',
  item        text,                              -- что вернули: товар или «бронь»
  note        text,
  admin_id    bigint,
  admin_name  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_created_idx ON refunds (created_at DESC);

-- Кому слать уведомления в Telegram и о чём именно.
-- Подписка привязана к чату: руководитель пишет боту, бот запоминает чат.
CREATE TABLE IF NOT EXISTS tg_subs (
  id          bigserial PRIMARY KEY,
  chat_id     bigint      NOT NULL UNIQUE,
  name        text,
  admin_id    bigint      REFERENCES admins(id) ON DELETE SET NULL,
  on_booking  boolean     NOT NULL DEFAULT true,   -- новые заявки и брони
  on_payment  boolean     NOT NULL DEFAULT true,   -- каждая оплата
  on_refund   boolean     NOT NULL DEFAULT true,   -- возвраты
  on_cancel   boolean     NOT NULL DEFAULT true,   -- отмены и неявки
  on_sale     boolean     NOT NULL DEFAULT true,   -- продажи в кассе
  on_daily    boolean     NOT NULL DEFAULT true,   -- итог за день
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Одноразовый код привязки: в админке жмут «Подключить Telegram»,
-- бот получает /start <код> и связывает чат с сотрудником.
CREATE TABLE IF NOT EXISTS tg_codes (
  code       text        PRIMARY KEY,
  admin_id   bigint,
  admin_name text,
  expires_at timestamptz NOT NULL
);

-- Последний разобранный апдейт Telegram и день, за который уже слали итог
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tg_offset  bigint;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tg_daily_at text;
