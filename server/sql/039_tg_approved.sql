-- Уведомления получает не любой, кто нашёл бота, а только тот, кого
-- разрешил владелец клуба (заказчик, 21.09.2026).
-- Нажал «Старт» — бот сообщает свой ID и ждёт: рассылка ему не идёт,
-- пока владелец не разрешит его в админке.
ALTER TABLE tg_subs ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
-- Те, кого успели подключить ссылкой-приглашением, остаются разрешёнными
UPDATE tg_subs SET approved = true WHERE admin_id IS NOT NULL;
