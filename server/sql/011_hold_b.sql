-- Бронь держится ограниченное время, пока её не подтвердят.
--
-- Оплата идёт через менеджера в WhatsApp или по телефону, поэтому заявка
-- из приложения какое-то время висит неоплаченной. До этого она держала корт
-- вечно: человек мог записаться и пропасть, а время никто больше занять не мог.
--
-- Теперь у заявки есть срок. Не подтвердили вовремя — место освобождается само
-- и снова видно в расписании.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_until timestamptz;
CREATE INDEX IF NOT EXISTS bookings_hold ON bookings (hold_until)
  WHERE status = 'pending';

-- Просроченная заявка больше не занимает время: она должна выпасть
-- из запрета на пересечение так же, как отменённая.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_booking;
ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (
  court_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status <> 'cancelled' AND status <> 'expired');

-- Сколько минут держим неоплаченную заявку
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hold_minutes smallint NOT NULL DEFAULT 60
  CHECK (hold_minutes BETWEEN 5 AND 1440);
