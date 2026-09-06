-- Настройки клуба переезжают из кода в базу.
--
-- Часы работы, граница утреннего тарифа и предельная длина брони были
-- константами в src/club.ts: поменять их мог только программист. Теперь
-- это строка в таблице, и менеджер правит их из админки.
CREATE TABLE IF NOT EXISTS settings (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  open_hour     smallint NOT NULL DEFAULT 9  CHECK (open_hour  BETWEEN 0 AND 23),
  close_hour    smallint NOT NULL DEFAULT 24 CHECK (close_hour BETWEEN 1 AND 24),
  morning_until smallint NOT NULL DEFAULT 13 CHECK (morning_until BETWEEN 0 AND 24),
  max_hours     smallint NOT NULL DEFAULT 3  CHECK (max_hours BETWEEN 1 AND 12),
  cancel_hours  smallint NOT NULL DEFAULT 4  CHECK (cancel_hours BETWEEN 0 AND 48),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_before_close CHECK (open_hour < close_hour)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
