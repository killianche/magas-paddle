-- Продажи как отдельная система: что именно продали (позиция из прайса проката)
-- и два переключателя клуба — вести продажи и учитывать их в аналитике.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS item text;
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS sales_on       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sales_in_stats boolean NOT NULL DEFAULT true;
