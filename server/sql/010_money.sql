-- Всё остальное, что нужно, чтобы считать не оборот, а заработок.
--
-- 1. Расходы. Без них вопрос «окупается ли клуб» не имеет ответа в системе.
--    Вводятся раз в месяц: аренда, зарплаты, свет, кредит, реклама, инвентарь.
-- 2. Прочие продажи: бар, прокат ракеток, тренировки. В клубах это заметная
--    часть денег, а завести их было негде.
-- 3. Мелочи на броне, без которых аналитика врала: сколько человек играло,
--    ручная скидка с причиной, кто оформил.
-- 4. Оплата турнирных взносов: взнос был записан на турнире, а факта оплаты нет.

CREATE TABLE IF NOT EXISTS expenses (
  id         bigserial PRIMARY KEY,
  -- Первое число месяца, к которому относится расход
  month      date NOT NULL,
  -- rent, salary, utilities, loan, marketing, equipment, tax, other
  category   text NOT NULL,
  amount     integer NOT NULL CHECK (amount > 0),
  note       text,
  admin_id   bigint REFERENCES admins(id) ON DELETE SET NULL,
  admin_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_month ON expenses (month);

CREATE TABLE IF NOT EXISTS sales (
  id         bigserial PRIMARY KEY,
  -- Операционный день: продажу могут внести и на следующее утро
  day        date NOT NULL,
  -- bar, rental, coaching, shop, other
  category   text NOT NULL,
  amount     integer NOT NULL CHECK (amount <> 0),
  method     text NOT NULL CHECK (method IN ('cash','card','sbp','transfer','invoice')),
  qty        smallint NOT NULL DEFAULT 1 CHECK (qty > 0),
  note       text,
  admin_id   bigint REFERENCES admins(id) ON DELETE SET NULL,
  admin_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_day ON sales (day);

-- Сколько человек играло: падел — четверо, мини-футбол — десять.
-- Без этого нет ни трафика, ни выручки на человека.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS players smallint
  CHECK (players IS NULL OR players BETWEEN 1 AND 30);
-- Ручная скидка: цена считается по прайсу, а скидку постоянному записать было некуда
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0
  CHECK (discount >= 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_reason text;
-- Кто оформил: чтобы можно было посмотреть работу конкретного сотрудника
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0
  CHECK (paid_amount >= 0);
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS paid_method text
  CHECK (paid_method IS NULL OR paid_method IN ('cash','card','sbp','transfer','invoice'));
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS paid_at timestamptz;
