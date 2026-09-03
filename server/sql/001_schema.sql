-- Схема Magas Padel. Выполняется один раз при первом запуске базы.
-- Главное здесь — запрет двойной брони на уровне СУБД, а не приложения.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Площадки ────────────────────────────────────────────────────────────────
CREATE TABLE courts (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  is_football   boolean NOT NULL DEFAULT false,
  -- Тарифы в копейках: деньги в дробных числах не хранят
  price_day     integer NOT NULL CHECK (price_day > 0),
  price_evening integer NOT NULL CHECK (price_evening > 0),
  -- Выключенная площадка не показывается в приложении вообще
  is_active     boolean NOT NULL DEFAULT true,
  -- Временная блокировка: ремонт, турнир. Площадка видна, но занята
  closed_until  timestamptz,
  closed_reason text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Клиенты ─────────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL UNIQUE,
  name        text NOT NULL,
  -- История поведения: менеджер должен видеть, кто часто отменяет и не приходит
  no_shows    integer NOT NULL DEFAULT 0,
  cancels     integer NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'no_show', 'done');

-- ── Брони ───────────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id          bigserial PRIMARY KEY,
  court_id    text NOT NULL REFERENCES courts(id) ON DELETE RESTRICT,
  client_id   bigint REFERENCES clients(id) ON DELETE SET NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      booking_status NOT NULL DEFAULT 'pending',
  price       integer NOT NULL CHECK (price >= 0),
  source      text NOT NULL DEFAULT 'app',
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ends_after_start CHECK (ends_at > starts_at),

  -- Два человека не займут одну площадку на пересекающееся время.
  -- Проверка живёт в базе: даже если два запроса придут в одну миллисекунду
  -- или кто-то полезет в базу руками мимо приложения, вторая запись не пройдёт.
  -- Отменённые брони из проверки исключены — их время снова свободно.
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX bookings_court_time ON bookings (court_id, starts_at);
CREATE INDEX bookings_client     ON bookings (client_id);
CREATE INDEX bookings_status     ON bookings (status) WHERE status = 'pending';

-- ── Турниры ─────────────────────────────────────────────────────────────────
CREATE TYPE tournament_state AS ENUM ('soon', 'open', 'done');

CREATE TABLE tournaments (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  starts_at   timestamptz NOT NULL,
  format      text NOT NULL,
  fee         integer NOT NULL CHECK (fee >= 0),
  seats       integer NOT NULL CHECK (seats > 0),
  state       tournament_state NOT NULL DEFAULT 'soon',
  -- Обложку и итоги менеджер меняет из админки
  cover_url   text,
  result_text text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tournament_entries (
  id            bigserial PRIMARY KEY,
  tournament_id bigint NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  client_id     bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Один человек — одна запись на турнир
  UNIQUE (tournament_id, client_id)
);

-- ── Обновление updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_touch BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
