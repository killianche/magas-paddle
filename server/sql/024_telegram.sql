-- Telegram клуба — четвёртая кнопка связи на главной рядом с WhatsApp,
-- звонком и Instagram. Ссылка вида https://t.me/имя; пусто — кнопка неактивна.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS telegram text;
