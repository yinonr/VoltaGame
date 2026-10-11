import type { GameState } from './types';

// Market events (experimental, rules.marketEvents; off by default and in Classic Mode).
//
// OWNER: Market events agent. Stub to implement.

/**
 * Called by the reducer at the start of every turn (END_TURN, after the new current player is set,
 * before the victory check). `s` is already cloned. Must be a no-op unless rules.marketEvents is on,
 * and must not consume the game RNG (`s.rng`), so enabling events never changes the dice.
 */
export function applyMarketEvents(_s: GameState): void {}
