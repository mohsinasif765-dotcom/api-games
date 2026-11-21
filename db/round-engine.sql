-- Round engine support (gateway WebSocket engine + pg_cron safety net).
--
-- The gateway's RoundEngine fires tick_game_rounds_locked() at the exact
-- millisecond a phase ends, then pushes the new phase to players over
-- Socket.IO. pg_cron keeps calling the same locked tick every second as a
-- safety net, so rounds still advance (≤1s late) if every gateway is down.
--
-- Money logic (winner pick / RTP / payouts / fees) stays in tick_game_rounds()
-- and is NOT changed here. This file only adds a mutual-exclusion wrapper.
--
-- Apply: node scripts/apply-round-engine.mjs
-- Rollback: SELECT cron.schedule('tick-game-rounds', '1 second',
--             $$SELECT public.tick_game_rounds()$$);

-- One tick at a time across gateway instances and pg_cron.
-- Returns -1 when another tick holds the lock (caller just retries shortly).
CREATE OR REPLACE FUNCTION public.tick_game_rounds_locked()
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('api_games.tick_game_rounds')) THEN
    RETURN -1;
  END IF;
  RETURN public.tick_game_rounds();
END;
$$;

-- pg_cron: same job name → replaces the existing schedule in place.
SELECT cron.schedule(
  'tick-game-rounds',
  '1 second',
  $$SELECT public.tick_game_rounds_locked()$$
);
