import { GENERATED_WARMUP_GAMES } from './manifest.generated';

/**
 * Games the host app can warm before the player opens them.
 *
 * `path`   — game page; its HTML is read at warm-up time to discover the
 *            current deployment's JS/CSS/font URLs (they change every deploy),
 *            its CSS is scanned for url(...) images and its JS for lazily
 *            loaded chunks (e.g. Phaser).
 * `assets` — files the game loads at runtime that are not in the HTML/CSS
 *            (Phaser preloads, popups, sounds). Generated from source by
 *            scripts/gen-warmup-manifest.mjs on every build — never stale.
 */
export type WarmupGame = {
  path: string;
  assets: readonly string[];
};

export const WARMUP_GAMES: Record<string, WarmupGame> = GENERATED_WARMUP_GAMES;

/** Warmed when the host passes no `games` param. */
export const DEFAULT_WARMUP_GAMES = ['greedylion'] as const;
