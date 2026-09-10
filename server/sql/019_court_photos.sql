-- Фотографии площадок, которые клуб загружает сам из админки.
-- Файлы лежат на диске сервера (/var/www/padelmagas/uploads), здесь — адрес и
-- порядок. Первое фото — главное: оно на карточке корта и в шапке галереи.
create table if not exists court_photos (
  id         bigserial primary key,
  court_id   text not null references courts(id) on delete cascade,
  url        text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists court_photos_court on court_photos (court_id, sort);
