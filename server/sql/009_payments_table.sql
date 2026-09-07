-- Платежи отдельной таблицей: на одной броне их бывает несколько.
--
-- Первый заход хранил оплату прямо в броне одной суммой. Это не годится:
-- в падел на корте четверо, двое скидываются сейчас, двое доплачивают на месте.
-- Плюс бывают возврат и удержание за неявку — их нельзя записать правкой суммы,
-- иначе пропадает след, кто и когда что вернул.

CREATE TABLE IF NOT EXISTS payments (
  id         bigserial PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  -- Сумма в копейках. Отрицательная — возврат.
  amount     integer NOT NULL CHECK (amount <> 0),
  -- cash — наличные, card — терминал, sbp — по QR, transfer — перевод на карту,
  -- invoice — счёт организации
  method     text NOT NULL CHECK (method IN ('cash','card','sbp','transfer','invoice')),
  -- payment — обычная оплата, refund — возврат, penalty — удержание за неявку
  kind       text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund','penalty')),
  -- Номер чека: по 54-ФЗ касса нужна и на наличные, и на безнал
  receipt    text,
  note       text,
  admin_id   bigint REFERENCES admins(id) ON DELETE SET NULL,
  admin_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking ON payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_time ON payments (created_at);

-- Переносим то, что успели отметить первым заходом (сейчас таких строк нет,
-- но миграция должна быть безопасна и на непустой базе).
INSERT INTO payments (booking_id, amount, method, admin_id, admin_name, created_at)
SELECT b.id, b.paid_amount,
       CASE WHEN b.paid_method IN ('cash','card','transfer') THEN b.paid_method ELSE 'cash' END,
       b.paid_by, COALESCE(a.name, 'перенесено'), COALESCE(b.paid_at, now())
FROM bookings b LEFT JOIN admins a ON a.id = b.paid_by
WHERE b.paid_amount > 0;

ALTER TABLE bookings DROP COLUMN IF EXISTS paid_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS paid_method;
ALTER TABLE bookings DROP COLUMN IF EXISTS paid_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS paid_by;

-- Когда и кем сменился статус. Без этого нельзя ни ответить клиенту
-- «кто отменил мою бронь», ни посчитать поздние отмены.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_at timestamptz;
-- 'client' — отменил сам через приложение, иначе — логин сотрудника
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_by text;
