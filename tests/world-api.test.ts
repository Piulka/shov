import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import type { GameView } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

const cleanups: Array<() => Promise<void>> = [];
function setup(options: Parameters<typeof worldFixture>[0] = {}) {
  const save = worldFixture(options);
  const app = createApp({ databasePath: save.databasePath, now: () => worldEpoch });
  cleanups.push(async () => { await app.close(); save.cleanup(); });
  const send = (command: unknown, revision = 1, id = randomUUID()) => app.inject({ method: 'POST', url: '/api/command', headers: { cookie: save.cookie }, payload: { id, revision, command } });
  return { app, save, send };
}
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe('regional progression HTTP contract', () => {
  it('exposes three regions but still rejects travel beyond earned routes', async () => {
    const { app, save, send } = setup({ level: 24, routeId: 'heartwood', unlockedThrough: 'heartwood' });
    const result = await app.inject({ url: '/api/state', headers: { cookie: save.cookie } });
    expect(result.statusCode).toBe(200);
    const view = result.json<GameView>();
    expect(view.catalog.regions.map(region => region.id)).toEqual(['terraces', 'glassgarden', 'carmine']);
    expect(view.catalog.routes).toHaveLength(9);
    expect((await send({ type: 'route', routeId: 'carmine', mode: 'farm' }, view.revision)).statusCode).toBe(400);
    expect(save.saved().routeId).toBe('heartwood');
  });

  it('reforges the same equipped item exactly once and preserves the running battle', async () => {
    const { save, send } = setup();
    const id = randomUUID();
    const action = { type: 'reforge', itemId: save.state.build.equipment.weapon, level: 33 };
    const first = await send(action, 1, id);
    expect(first.statusCode, first.body).toBe(200);
    const view = first.json<GameView>();
    const beforeItem = save.state.inventory[0];
    expect(view.state.inventory[0]).toEqual({ ...beforeItem, level: 33 });
    expect(view.state.wallet).toEqual({ coins: 89_740, thread: 1794, catalyst: 60 });
    expect(view.state.battle).toEqual(save.state.battle);
    expect(view.state.build).toEqual(save.state.build);
    expect(view.state.presets).toEqual(save.state.presets);
    expect(view.state.upgrades).toEqual(save.state.upgrades);
    expect(save.saved().rng).toBe(save.state.rng);
    const replay = await send(action, 1, id);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<GameView>().state).toEqual(view.state);
    expect(replay.json<GameView>().revision).toBe(view.revision);
  });

  it('rejects forged price, invalid target, locked level and insufficient money without partial writes', async () => {
    const { save, send } = setup({ wallet: { coins: 1, thread: 1, catalyst: 0 } });
    const base = { type: 'reforge', itemId: save.state.inventory[0].id, level: 33 };
    for (const input of [base, { ...base, cost: 0 }, { ...base, level: 100 }, { ...base, level: 24 }, { ...base, level: 24.5 }, { ...base, itemId: 'not-owned' }]) {
      const response = await send(input);
      expect(response.statusCode, response.body).toBe(400);
      expect(save.saved()).toEqual(save.state);
    }
  });

  it('keeps resonant recipes gated by region and level even for a wealthy account', async () => {
    const { save, send } = setup({ level: 24, routeId: 'heartwood', unlockedThrough: 'heartwood' });
    const response = await send({ type: 'craft', slot: 'ring', affix: 'haste', secondAffix: 'crit', rarity: 'resonant' });
    expect(response.statusCode, response.body).toBe(400);
    expect(save.saved()).toEqual(save.state);
  });

  it('creates a resonant item with exactly two chosen legal properties and persists it', async () => {
    const { save, send } = setup();
    const action = { type: 'craft', slot: 'ring', affix: 'haste', secondAffix: 'crit', rarity: 'resonant' };
    const id = randomUUID();
    const result = await send(action, 1, id);
    expect(result.statusCode, result.body).toBe(200);
    const view = result.json<GameView>();
    expect(view.state.inventory.at(-1)).toMatchObject({ slot: 'ring', rarity: 'resonant', level: 33, affixes: ['haste', 'crit'] });
    expect(view.state.wallet).toEqual({ coins: 82_000, thread: 1640, catalyst: 36 });
    const repeated = await send(action, 1, id);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<GameView>().state).toEqual(view.state);
    expect(save.saved().inventory.at(-1)).toEqual(view.state.inventory.at(-1));
  });

  it('rejects duplicate, missing, incompatible and injected extra affixes atomically', async () => {
    const { save, send } = setup();
    const command = { type: 'craft', slot: 'head', affix: 'hp', rarity: 'resonant' };
    for (const input of [command, { ...command, secondAffix: 'hp' }, { ...command, secondAffix: 'crit' }, { ...command, rarity: 'fine', secondAffix: 'armor' }, { ...command, secondAffix: 'armor', affixes: ['hp', 'armor', 'crit'] }]) {
      const result = await send(input);
      expect(result.statusCode, result.body).toBe(400);
      expect(save.saved()).toEqual(save.state);
    }
  });
});
