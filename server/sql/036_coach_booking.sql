-- Выбор тренера прямо при бронировании корта (заказчик, 21.09.2026).
-- Человек отмечает «играть с тренером», видит свободных в это время и
-- выбирает одного; менеджер потом уточняет и при необходимости меняет тренера.
--
-- Функцию можно выключить целиком одним переключателем: coaches_on = false —
-- в приложении не остаётся ни галочки, ни тренеров, ни групповых тренировок.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS coaches_on boolean NOT NULL DEFAULT true;

-- Анкета тренера: фамилия и опыт показываются в приложении при выборе
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS surname text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS experience text;
