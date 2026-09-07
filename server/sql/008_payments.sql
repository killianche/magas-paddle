-- Факт оплаты.
--
-- До этого в системе не было понятия «деньги получены»: цифра «к оплате за день»
-- складывала все записи, включая неподтверждённые заявки. Понять, сколько
-- на самом деле в кассе, было нельзя.
--
-- Оплата хранится прямо в броне: одна игра — одна оплата. Сумма отдельно
-- от цены, потому что бывает скидка постоянному клиенту или доплата.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0
  CHECK (paid_amount >= 0);
-- cash — наличные, transfer — перевод на карту, card — терминал
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_method text
  CHECK (paid_method IS NULL OR paid_method IN ('cash', 'transfer', 'card'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at timestamptz;
-- Кто принял деньги: спрашивать за кассу нужно с человека, а не с системы
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_by bigint REFERENCES admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_paid_at ON bookings (paid_at);
CREATE INDEX IF NOT EXISTS bookings_starts ON bookings (starts_at);
