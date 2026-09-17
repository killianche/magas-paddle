-- Состояние турнира «Запись закрыта»: в админке оно было, а в базе нет —
-- сохранение турнира с ним падало с ошибкой.
ALTER TYPE tournament_state ADD VALUE IF NOT EXISTS 'closed' BEFORE 'done';
