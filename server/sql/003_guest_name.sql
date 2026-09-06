-- Имя гостя, записанного менеджером без телефона.
--
-- Раньше клиент заводился только когда был телефон, и запись «Ахмед, без номера»
-- превращалась в сетке в «Без имени»: имя терялось совсем. Теперь оно хранится
-- прямо в брони, а клиентская карточка по-прежнему заводится только по номеру.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name text;

-- Единый вид телефона: 11 цифр, начинается с 7.
-- До этого «9280001122» и «+79280001122» были двумя разными клиентами.
UPDATE clients SET phone = '7' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
WHERE regexp_replace(phone, '\D', '', 'g') ~ '^8[0-9]{10}$';

UPDATE clients SET phone = regexp_replace(phone, '\D', '', 'g')
WHERE phone <> regexp_replace(phone, '\D', '', 'g')
  AND regexp_replace(phone, '\D', '', 'g') ~ '^7[0-9]{10}$';
