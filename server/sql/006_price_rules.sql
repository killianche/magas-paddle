-- Особые цены: выходные дороже, утро длиннее, отдельная цена для одной площадки.
--
-- Основная цена по-прежнему живёт в courts (утренний и дневной тариф с границей
-- часа в settings) — это то, что клуб называет обычной ценой. Правила здесь
-- перекрывают её на конкретные дни и часы. Час без подходящего правила стоит
-- обычную цену, поэтому пустая таблица ничего не меняет.
CREATE TABLE IF NOT EXISTS price_rules (
  id         bigserial PRIMARY KEY,
  -- NULL — правило действует на все площадки
  court_id   text REFERENCES courts(id) ON DELETE CASCADE,
  -- NULL — любой день недели; иначе 1 (понедельник) … 7 (воскресенье)
  days       smallint[],
  from_hour  smallint NOT NULL CHECK (from_hour BETWEEN 0 AND 23),
  to_hour    smallint NOT NULL CHECK (to_hour   BETWEEN 1 AND 24),
  price      integer  NOT NULL CHECK (price >= 0),
  note       text,
  sort_order integer  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT from_before_to CHECK (from_hour < to_hour),
  CONSTRAINT days_are_valid CHECK (
    days IS NULL OR (array_length(days, 1) BETWEEN 1 AND 7
                     AND days <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
  )
);

CREATE INDEX IF NOT EXISTS price_rules_order ON price_rules (sort_order, id);
