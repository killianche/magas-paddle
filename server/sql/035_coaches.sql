-- Тренеры (заказчик, 19.09.2026). Как в Playtomic Academy и подобных системах:
-- профиль тренера с ценой и расписанием, индивидуальные тренировки — бронь
-- корта с тренером, групповые — событие с местами и записью (как турнир),
-- отметка «проведена», отчёт по тренеру и выплаты.
--
-- Цены и схему оплаты тренера задаёт клуб — здесь нет ни одной выдуманной цифры.

CREATE TABLE IF NOT EXISTS coaches (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  phone       text,
  photo_url   text,
  bio         text,                      -- о себе: опыт, уровень, для кого тренировки
  -- Цена индивидуальной тренировки за час, копейки (то, что платит клиент тренеру/клубу)
  price       integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- Корт на тренировке оплачивается отдельно по тарифу клуба (true)
  -- или уже входит в цену тренировки (false)
  court_extra boolean NOT NULL DEFAULT true,
  -- Оплата тренеру: процент от цены тренировки, фикс за час или фикс за тренировку
  pay_type    text NOT NULL DEFAULT 'percent' CHECK (pay_type IN ('percent','per_hour','per_lesson')),
  pay_value   integer NOT NULL DEFAULT 0 CHECK (pay_value >= 0),  -- процент или копейки
  -- Когда тренер работает: {"1":[9,21],"2":[9,21],...}; день — 1 пн … 7 вс.
  -- NULL — в часы работы клуба
  week        jsonb,
  color       text,
  in_app      boolean NOT NULL DEFAULT true,   -- показывать в приложении и принимать запись
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  admin_id    bigint REFERENCES admins(id) ON DELETE SET NULL,  -- вход тренера в админку
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Индивидуальная тренировка = бронь корта с тренером
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coach_id bigint REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coach_price integer NOT NULL DEFAULT 0 CHECK (coach_price >= 0);
CREATE INDEX IF NOT EXISTS bookings_coach ON bookings(coach_id, starts_at) WHERE coach_id IS NOT NULL;
-- Тренер не может вести две тренировки одновременно — проверяет сама база
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_coach;
ALTER TABLE bookings ADD CONSTRAINT no_double_coach EXCLUDE USING gist (
  coach_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (coach_id IS NOT NULL AND status <> 'cancelled' AND status <> 'expired');

-- Групповая тренировка = событие с местами и записью, как турнир
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'tournament'
  CHECK (kind IN ('tournament','class'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS coach_id bigint REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS level text;
-- Отметка «был на тренировке»
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS attended boolean;

-- Выплаты тренерам: сколько, за какой период, чем
CREATE TABLE IF NOT EXISTS coach_payouts (
  id          bigserial PRIMARY KEY,
  coach_id    bigint NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  amount      integer NOT NULL CHECK (amount > 0),
  period_from date,
  period_to   date,
  method      text NOT NULL DEFAULT 'cash',
  note        text,
  admin_id    bigint,
  admin_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_payouts_coach ON coach_payouts(coach_id, created_at DESC);
