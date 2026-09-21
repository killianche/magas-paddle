-- Отдельный вход для тренера (заказчик, 21.09.2026).
-- У тренера своя учётная запись и свой кабинет: записи к нему, история
-- тренировок и заработок. Прав по клубу у такой записи нет совсем.
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('owner', 'staff', 'coach'));
