-- Контакты клуба в настройках, а не в коде приложения.
--
-- Номера телефона и WhatsApp держали путь подтверждения брони: человек
-- отправляет заявку и должен связаться с менеджером. Раньше номер вписывался
-- в приложение и требовал новой сборки; теперь он меняется из админки.
alter table settings add column if not exists phone     text;
alter table settings add column if not exists whatsapp  text;
alter table settings add column if not exists address   text;
alter table settings add column if not exists map_url   text;
alter table settings add column if not exists instagram text;

-- Известное: карту и инстаграм заказчик уже присылал, они лежали в коде.
update settings set
  map_url   = coalesce(map_url,   'https://yandex.ru/maps/-/CTdnmJ8N'),
  instagram = coalesce(instagram, 'https://www.instagram.com/padel_magas/')
where id = 1;
