-- Услуга «Семейный»: крытый корт готовят так, чтобы снаружи не было видно,
-- кто играет. Отмечается при записи, доступна не на всех кортах.
alter table courts   add column if not exists is_family boolean not null default false;
alter table bookings add column if not exists family    boolean not null default false;
alter table settings add column if not exists family_on boolean not null default true;

update courts set is_family = true where id = 'c6';
