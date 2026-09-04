-- ЗАГЛУШКИ. Ровно те же значения, что сейчас зашиты в приложении.
-- Заменяются на данные клуба, когда он их пришлёт (вопросы Q1–Q8, Q44).
-- Цены в копейках.

INSERT INTO courts (id, name, is_football, price_day, price_evening, is_active, sort_order) VALUES
  ('c1', 'Корт 1',      false, 300000, 450000, true, 1),
  ('c2', 'Корт 2',      false, 300000, 450000, true, 2),
  ('c3', 'Корт 3',      false, 300000, 450000, true, 3),
  ('c4', 'Корт 4',      false, 300000, 450000, true, 4),
  ('c5', 'Корт 5',      false, 300000, 450000, true, 5),
  ('c6', 'Корт 6',      false, 300000, 450000, true, 6),
  ('f1', 'Мини-футбол', true,  333300, 500000, true, 7)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, price_day = EXCLUDED.price_day,
  price_evening = EXCLUDED.price_evening, sort_order = EXCLUDED.sort_order;

-- Корт 6 закрыт на ремонт: показываем, но занять нельзя
UPDATE courts SET closed_until = now() + interval '2 days',
                  closed_reason = 'Ремонт покрытия'
WHERE id = 'c6';

INSERT INTO tournaments (name, starts_at, format, fee, seats, state, cover_url, result_text) VALUES
  ('Осенний кубок Магаса', timestamptz '2026-09-14 10:00+03', 'Americano', 250000, 20, 'open', 't1', NULL),
  ('Ночной Mexicano',      timestamptz '2026-09-21 21:00+03', 'Mexicano',  200000, 16, 'open', 't2', NULL),
  ('Парный турнир',        timestamptz '2026-10-05 11:00+03', 'Группы и плей-офф', 300000, 24, 'soon', 't3', NULL),
  ('Летний кубок Магаса',  timestamptz '2026-08-24 10:00+03', 'Americano', 250000, 20, 'done', 't4',
   'Победили Ахмед Барханоев и Тимур Евлоев. Второе место — Магомед Аушев и Ислам Костоев.')
ON CONFLICT DO NOTHING;
