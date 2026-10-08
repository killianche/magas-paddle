-- Вход по номеру: экран входа при запуске и подтверждение номера звонком.
-- Оба выключателя — чтобы вернуться к прежнему порядку без пересборки.
alter table settings add column if not exists phone_gate       boolean not null default true;
-- Подтверждение по умолчанию выключено: сборки, уже стоящие у людей, не умеют
-- его присылать, и регистрация у них сломалась бы. Клуб включает его в админке,
-- когда новая сборка разойдётся.
alter table settings add column if not exists phone_verify_on  boolean not null default false;
