-- Итоги турнира и баннер на главной приложения.
-- results — призовые места: [{ "place": 1, "names": "Иван / Пётр", "prize": "20 000 ₽" }]
-- result_photos — фото с турнира (пути /uploads/tournaments/…)
-- banner_on — показывать баннер с итогами на главной; включён не больше одного.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS results       jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS result_photos text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banner_on     boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_one_banner ON tournaments (banner_on) WHERE banner_on;
