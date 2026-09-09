import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionDigest } from '../../server/auth';
import { GameStore } from '../../server/store';
import { catalog } from '../../shared/content';
import { createGame, simulate } from '../../shared/engine';
import type { GameState, Wallet } from '../../shared/types';

export const worldEpoch = Date.UTC(2026, 8, 9, 12);

export function worldFixture(options: { level?: number; routeId?: string; unlockedThrough?: string; wallet?: Wallet } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'shov-world-'));
  const databasePath = join(directory, 'game.sqlite');
  const state = createGame(`local:${randomUUID()}`, worldEpoch, 4216);
  state.level = options.level ?? 30;
  state.wallet = options.wallet ?? { coins: 100_000, thread: 2000, catalyst: 60 };
  state.chapter.legacy = true;
  state.inventory.forEach(item => { item.level = 24; item.rarity = 'fine'; item.affixes = ['hp']; });
  for (const slot of catalog.slots) state.upgrades[slot] = 3;
  state.build.skills = ['wedge', 'ringing', 'mend', 'cleanse'];
  state.build.rules = [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'no_shield', skillId: 'wedge' }];
  const through = catalog.routes.findIndex(route => route.id === (options.unlockedThrough ?? 'weft'));
  if (through < 0) throw new Error('Unknown fixture route.');
  state.unlockedRoutes = catalog.routes.slice(0, through + 1).map(route => route.id);
  state.routeWins = Object.fromEntries(state.unlockedRoutes.map(id => [id, 5]));
  state.routeId = options.routeId ?? 'carmine';
  const route = catalog.routes.find(route => route.id === state.routeId)!;
  state.battle = {
    ...simulate(state, state.build, catalog.enemies.find(enemy => enemy.id === route.enemyIds[0])!, worldEpoch, state),
    regionId: route.regionId,
    production: { version: 2, reward: { ...route.reward }, rewardPeriodMs: route.rewardPeriodMs, lootIntervalMs: route.lootIntervalMs },
  };
  const token = randomBytes(32).toString('hex');
  const store = new GameStore(databasePath);
  store.transaction(() => {
    store.createGame(state, worldEpoch);
    store.createSession(sessionDigest(token), state.id, worldEpoch + 7 * 86_400_000, worldEpoch);
  });
  store.close();
  return {
    databasePath, state, token, cookie: `shov_session=${token}`,
    saved: () => {
      const reader = new GameStore(databasePath);
      try { return JSON.parse(reader.getGame(state.id)!.snapshot) as GameState; }
      finally { reader.close(); }
    },
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
