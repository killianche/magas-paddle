-- Настройки приложения, которыми управляет менеджер, и уведомления клиентам.
--
-- До этого часть правил жила прямо в коде приложения: доля предоплаты,
-- допустимое опоздание, сведения о прокате, показывать ли турниры и поле.
-- Менять их можно было только новой сборкой в App Store — то есть неделями.
alter table settings add column if not exists prepay_percent  smallint not null default 50;
alter table settings add column if not exists late_minutes    smallint not null default 15;
alter table settings add column if not exists rentals_text    text;
alter table settings add column if not exists show_tournaments boolean not null default true;
alter table settings add column if not exists show_football    boolean not null default true;

alter table settings add constraint settings_prepay_check
  check (prepay_percent between 0 and 100) not valid;
alter table settings add constraint settings_late_check
  check (late_minutes between 0 and 120) not valid;

-- Уведомления.
--
-- client_id пустой — сообщение всем сразу: клуб закрыт на праздник, новый
-- турнир, изменились цены. С клиентом — про его бронь.
-- read_at ставит приложение, когда человек открыл список.
create table if not exists notifications (
  id         bigserial primary key,
  client_id  bigint references clients(id) on delete cascade,
  kind       text not null default 'manual',
  title      text not null,
  body       text not null,
  booking_id bigint references bookings(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_client on notifications (client_id, created_at desc);
create index if not exists notifications_all    on notifications (created_at desc)
  where client_id is null;

-- Кто из клиентов какое общее сообщение прочитал: у рассылки нет владельца,
-- отметку читателя храним отдельно.
create table if not exists notification_reads (
  notification_id bigint not null references notifications(id) on delete cascade,
  client_id       bigint not null references clients(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, client_id)
);
