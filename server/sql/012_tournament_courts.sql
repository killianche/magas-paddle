-- Турнир занимает корты.
--
-- До этого турнир существовал сам по себе: 14 сентября во время «Осеннего
-- кубка» все шесть кортов оставались свободными, и клуб продал бы те же часы
-- второй раз. Теперь у турнира есть длительность и список площадок, а занятие
-- времени делается обычными бронями — тогда запрет на пересечение на уровне
-- базы работает сам, и менеджер видит турнир в сетке дня.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS hours smallint NOT NULL DEFAULT 3
  CHECK (hours BETWEEN 1 AND 15);
-- Пустой список — турнир кортов не занимает (например, выездной)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS court_ids text[] NOT NULL DEFAULT '{}';

-- Связь брони с турниром: по ней брони пересоздаются при правке
-- и исчезают, если турнир удалили
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tournament_id bigint
  REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS bookings_tournament ON bookings (tournament_id);
