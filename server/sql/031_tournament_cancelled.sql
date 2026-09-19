-- Турнир можно отменить: заявки снимаются с уведомлением, корты отпускаются.
ALTER TYPE tournament_state ADD VALUE IF NOT EXISTS 'cancelled';
