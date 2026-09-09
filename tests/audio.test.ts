import { describe, expect, it } from 'vitest';
import { BattleAudioCursor, battleSounds, commandSound } from '../src/audio/events';
import type { BattleEvent, BattleRun } from '../shared/types';

const event = (at: number, kind: BattleEvent['kind'] = 'attack'): BattleEvent => ({ at, kind, actor: 'hero', value: 10, label: 'label is not an identifier', heroHp: 100, enemyHp: 50, heroShield: 0 });
const battle = { startedAt: 1000, family: 'blade', enemy: { id: 'porcelain', kind: 'sentinel' }, events: [event(0), event(100), event(100, 'shield'), event(200), event(5000)] } as BattleRun;

describe('live battle audio', () => {
  it('does not replay the battle when first opened, refreshed, or corrected backwards', () => {
    const cursor = new BattleAudioCursor();
    expect(cursor.take(battle, 1050, true)).toEqual([]);
    expect(cursor.take(battle, 1110, true)).toHaveLength(2);
    expect(cursor.take(structuredClone(battle), 1120, true)).toEqual([]);
    expect(cursor.take(battle, 1040, true)).toEqual([]);
    expect(cursor.take(battle, 1110, true)).toEqual([]);
    expect(cursor.take(battle, 1210, true)).toEqual([battle.events[3]]);
  });
  it('consumes muted and hidden events without creating a delayed queue', () => {
    const cursor = new BattleAudioCursor();
    cursor.take(battle, 1050, true);
    cursor.take(battle, 1120, false);
    expect(cursor.take(battle, 1130, true)).toEqual([]);
    expect(cursor.take(battle, 6005, true)).toEqual([]);
    expect(cursor.take(battle, 6010, true)).toEqual([]);
  });
  it('resets on a new battle and discards events after a long scheduling gap', () => {
    const cursor = new BattleAudioCursor();
    cursor.take(battle, 1050, true);
    expect(cursor.take({ ...battle, startedAt: 6000 }, 6110, true)).toEqual([]);
    expect(cursor.take({ ...battle, startedAt: 6000 }, 6220, true)).toHaveLength(1);
  });
  it('keeps recovery and DoT distinct from attacks, including zero-value cleanse', () => {
    expect(battleSounds(event(100, 'shield'), battle)).toEqual(['sfx.shield.raise']);
    expect(battleSounds({ ...event(100, 'cleanse'), value: 0 }, battle)).toEqual(['sfx.cleanse']);
    expect(battleSounds(event(100, 'dot'), battle)).toEqual(['sfx.dot']);
    expect(commandSound({ type: 'craft', slot: 'ring', affix: 'hp' })).toEqual('sfx.item.craft');
  });
  it('plays a distinct weapon attack for sword, magic staff and bow', () => {
    for (const family of ['blade', 'glass', 'needle'] as const) {
      expect(battleSounds(event(100), { ...battle, family })).toEqual([`sfx.attack.${family}`, 'sfx.hit.ceramic']);
      expect(battleSounds({ ...event(100, 'skill'), critical: true }, { ...battle, family })).toEqual([`sfx.attack.${family}`, 'sfx.hit.ceramic', 'sfx.critical']);
    }
  });
});
