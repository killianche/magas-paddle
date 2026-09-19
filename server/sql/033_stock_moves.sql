-- Учёт мини-магазина (заказчик, 19.09.2026): привезли — приход, продали —
-- продажа по своей цене, испортилось — списание, пересчитали — пересчёт.
-- Каждое движение остатка — строка журнала: видно, кто, когда и сколько.
--
-- Прокат (ракетки, корзина мячей) со склада не уходит: вещь возвращается.
-- Продажа (банка мячей, вода) остаток уменьшает.

-- Закупочная цена за штуку (последний приход). Нужна для прибыли по товару;
-- не знаете — не заполняйте, прибыль тогда не считается.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost integer CHECK (cost IS NULL OR cost >= 0);

-- Себестоимость проданного на момент продажи: закупка × количество.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cost integer CHECK (cost IS NULL OR cost >= 0);

CREATE TABLE IF NOT EXISTS stock_moves (
  id          bigserial PRIMARY KEY,
  product_id  bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- receipt — приход, sale — продажа, return — возврат (удалили продажу или
  -- отменили бронь), writeoff — списание, count — пересчёт (инвентаризация)
  kind        text NOT NULL CHECK (kind IN ('receipt','sale','return','writeoff','count')),
  qty         integer NOT NULL,            -- со знаком: приход +, продажа −
  unit_cost   integer CHECK (unit_cost IS NULL OR unit_cost >= 0),
  stock_after integer,
  sale_id     bigint REFERENCES sales(id) ON DELETE SET NULL,
  note        text,
  admin_id    bigint,
  admin_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_moves_product ON stock_moves(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_moves_time ON stock_moves(created_at);
