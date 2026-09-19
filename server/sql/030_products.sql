-- Мини-магазин: товары с фото, ценой и остатком. Продажа товара списывает
-- остаток; удаление продажи возвращает. Остаток NULL — не считаем (услуги).
CREATE TABLE IF NOT EXISTS products (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  price       integer NOT NULL CHECK (price >= 0),
  category    text NOT NULL DEFAULT 'shop' CHECK (category IN ('shop','rental','bar','coaching','other')),
  photo_url   text,
  stock       integer CHECK (stock IS NULL OR stock >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_id bigint REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_product ON sales(product_id) WHERE product_id IS NOT NULL;
