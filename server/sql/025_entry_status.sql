-- Запись на турнир — как бронь корта: заявка, удержание места, подтверждение.
--
-- Раньше запись из приложения сразу считалась окончательной. Теперь человек
-- отправляет заявку и пишет менеджеру в WhatsApp; место держится
-- hold_until, пока менеджер не подтвердит. Не подтвердили вовремя — expired,
-- место возвращается. Прежние записи уже приняты — для них confirmed.
ALTER TABLE tournament_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS hold_until timestamptz,
  ADD COLUMN IF NOT EXISTS status_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_by text;

DO $$ BEGIN
  ALTER TABLE tournament_entries ADD CONSTRAINT tournament_entries_status_check
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS tournament_entries_pending
  ON tournament_entries (hold_until) WHERE status = 'pending';
