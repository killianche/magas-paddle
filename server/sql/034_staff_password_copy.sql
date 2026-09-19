-- Владелец видит пароли сотрудников (заказчик, 19.09.2026). Для входа по-прежнему
-- проверяется scrypt-хэш; здесь — копия, зашифрованная AES-256-GCM ключом
-- STAFF_PASS_KEY из .env сервера. Без ключа копия бесполезна.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_enc text;
