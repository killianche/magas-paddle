-- Продажа может быть строкой счёта брони: прокат ракетки, мячи к игре.
-- Такая продажа оплачивается вместе с кортом (method = 'bill'), отдельного
-- платежа у неё нет. Удаляется бронь — строка остаётся, но отвязывается.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS booking_id bigint REFERENCES bookings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_booking ON sales(booking_id) WHERE booking_id IS NOT NULL;
-- Покупка человеком без брони — с привязкой к его аккаунту: видно в CRM, что он покупал.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_client ON sales(client_id) WHERE client_id IS NOT NULL;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_method_check
  CHECK (method = ANY (ARRAY['cash','card','sbp','transfer','invoice','bill']));
