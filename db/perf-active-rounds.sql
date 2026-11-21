-- Perf: active-round lookups.
--
-- Problem (measured 2026-11-21 on prod): game_rounds holds ~906k rows, all but
-- ~40 'finished'. Every lookup of the live round filters `status <> 'finished'`,
-- which the (game_id, status, created_at) index can't seek on, so each one
-- scans every past round of that game (~400ms for greedy_king). tick_game_rounds()
-- does this once per game per tick → ~12.5s per tick (max 26s) on a
-- '1 second' cron, so betting→spinning flipped 6.4s late on average.
--
-- Fix: a partial index containing only non-finished rounds (tiny, ~40 rows).
-- Postgres uses it for `status <> 'finished'` and for status = 'betting' / 'spinning'.
--
-- CONCURRENTLY: no table lock, live games keep running. Must run outside a
-- transaction block (apply with scripts/apply-perf-active-rounds.mjs).
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS game_rounds_active_idx;

CREATE INDEX CONCURRENTLY IF NOT EXISTS game_rounds_active_idx
  ON public.game_rounds (game_id, created_at DESC)
  WHERE status <> 'finished';
