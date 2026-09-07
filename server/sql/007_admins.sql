-- Сотрудники, их права и вход по паролю.
--
-- До этого был один ключ на всех: кто отменил бронь или поменял цену —
-- выяснить было нельзя. Теперь у каждого свой вход, владелец клуба заводит
-- людей и выдаёт права, а действия пишутся в журнал.

CREATE TABLE IF NOT EXISTS admins (
  id            bigserial PRIMARY KEY,
  login         text NOT NULL UNIQUE,
  name          text NOT NULL,
  -- scrypt: соль и хэш через двоеточие, сам пароль нигде не хранится
  password_hash text NOT NULL,
  -- owner — владелец клуба: у него все права, снять их нельзя
  role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  -- что разрешено: cancel, prices, club, tournaments, staff
  perms         text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Вход держится на случайном токене; в базе лежит только его отпечаток,
-- поэтому утечка таблицы не даёт войти.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  admin_id   bigint NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin ON admin_sessions (admin_id);

-- Журнал: кто, когда и что сделал. Нужен, чтобы разобраться,
-- куда делась бронь и кто поднял цену.
CREATE TABLE IF NOT EXISTS admin_log (
  id         bigserial PRIMARY KEY,
  admin_id   bigint REFERENCES admins(id) ON DELETE SET NULL,
  admin_name text NOT NULL,
  action     text NOT NULL,
  details    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_log_time ON admin_log (created_at DESC);
