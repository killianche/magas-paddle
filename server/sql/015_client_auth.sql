-- Пароль у аккаунта игрока.
--
-- До этого приложение узнавало человека по одному лишь номеру телефона:
-- кто знал чужой номер, видел имя и историю посещений. Пароль это закрывает.
--
-- Обратная совместимость: у аккаунтов без пароля старый порядок сохраняется,
-- иначе версии приложения, уже разосланные тестировщикам, перестали бы
-- показывать записи. Как только пароль задан, доступ только по нему.
alter table clients add column if not exists pass_hash text;
alter table clients add column if not exists pass_at   timestamptz;

create table if not exists client_sessions (
  token_hash text primary key,
  client_id  bigint not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen  timestamptz not null default now()
);
create index if not exists client_sessions_client on client_sessions (client_id);
