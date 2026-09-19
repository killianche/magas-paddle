-- Неявка и поздняя отмена: внесённая предоплата остаётся клубу.
--
-- Раньше это оформлялось отдельным платежом вида 'penalty' — и те же деньги
-- считались дважды: один раз как предоплата, второй раз как «удержание».
-- Правильно так же, как в гостиничных системах (Oracle OPERA, no-show posting):
-- новых денег нет, меняется только признание уже полученных.
--
-- kept_prepay = true  → внесённое остаётся клубу, это выручка по брони
-- kept_prepay = false → внесённое нужно вернуть клиенту
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS kept_prepay boolean NOT NULL DEFAULT false;

-- Штрафов у клуба нет (решение заказчика 19.09.2026): удерживается только
-- та предоплата, которую человек уже внёс.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check
  CHECK (kind = ANY (ARRAY['payment','refund']));
