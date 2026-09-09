import { describe, expect, it } from 'vitest';
import { catalog, families } from '../shared/content';
import { createGame, simulate } from '../shared/engine';
import { raidDefaults, raidRoles, runRaid } from '../shared/raid';
import type { RaidLoadout, RaidRole } from '../shared/raid';
import type { Family, Rule } from '../shared/types';

const WEEK = Date.UTC(2026, 8, 7);
const WEEK_MS = 7 * 86_400_000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

describe('normalized weekly raid', () => {
  it.each(raidRoles)('reproduces $name from the same week and does not mutate input or catalog', ({ id }) => {
    const loadout = raidDefaults(id);
    const before = structuredClone(loadout);
    const catalogBefore = structuredClone(catalog);
    Object.freeze(loadout.skills);
    loadout.rules.forEach(Object.freeze);
    Object.freeze(loadout.rules);
    Object.freeze(loadout);
    const first = runRaid(id, loadout, WEEK, false);
    const second = runRaid(id, loadout, WEEK, false);
    expect(second).toEqual(first);
    expect(loadout).toEqual(before);
    expect(catalog).toEqual(catalogBefore);
    expect(first.completed).toBe(3);
    expect(first.score).toBeGreaterThanOrEqual(6_000);
    expect(first.score).toBeLessThan(10_000);
    expect(first.score).toBe(first.components.reduce((sum, entry) => sum + entry.points, 0));
    expect(first.durationSeconds).toBe(first.battles.reduce((sum, battle) => sum + battle.combatMs, 0) / 1_000);
    first.battles.forEach((battle, index) => {
      expect(battle.stats).toEqual({ power: 289, hp: 1358, armor: 140, haste: 0, crit: 0.05, direct: 0, dot: 0, support: 0 });
      expect(battle.events[0].heroHp).toBe(battle.stats.hp);
      expect(battle.startedAt).toBe(index === 0 ? 0 : first.battles[index - 1].endsAt);
      expect(battle.endsAt).toBe(battle.startedAt + battle.combatMs);
      expect(battle.production).toBeUndefined();
    });
  });

  it('uses separate deterministic weekly practice and scored streams', () => {
    const loadout = raidDefaults('rupture');
    const scored = runRaid('rupture', loadout, WEEK, false);
    const practice = runRaid('rupture', loadout, WEEK, true);
    expect(practice).toEqual(runRaid('rupture', loadout, WEEK, true));
    expect(practice.battles).not.toEqual(scored.battles);
    expect(runRaid('rupture', loadout, WEEK + WEEK_MS, false).battles).not.toEqual(scored.battles);
  });

  it('ignores player wealth, gear and client seed fields; returns independent defaults', () => {
    const loadout = raidDefaults('rupture');
    const forged = { ...loadout, level: 100, inventory: [{ level: 100, rarity: 'named' }], upgrades: { weapon: 12 }, wallet: { coins: 99_999_999 }, seed: 4 };
    expect(runRaid('rupture', forged, WEEK, false)).toEqual(runRaid('rupture', loadout, WEEK, false));
    loadout.skills[0] = 'mend';
    loadout.rules[0].condition = 'always';
    expect(raidDefaults('rupture').skills[0]).toBe('shard');
    expect(raidDefaults('rupture').rules[0].condition).toBe('vulnerable');
  });

  const improvements: { role: RaidRole; loadout: RaidLoadout }[] = [
    { role: 'rupture', loadout: { family: 'needle', skills: ['stitch', 'spool', 'fasten', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'three_marks', skillId: 'fasten' }] } },
    { role: 'bulwark', loadout: { family: 'blade', skills: ['fracture', 'wedge', 'barrier', 'mend'], rules: [{ condition: 'enemy_windup', skillId: 'barrier' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }] } },
    { role: 'cleanse', loadout: { family: 'glass', skills: ['shard', 'lens', 'flash', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }] } },
  ];
  it.each(improvements)('allows a stronger deliberate $role loadout', ({ role, loadout }) => {
    const improved = runRaid(role, loadout, WEEK, false);
    const defaultResult = runRaid(role, raidDefaults(role), WEEK, false);
    expect(improved.completed).toBe(3);
    expect(improved.score).toBeGreaterThan(defaultResult.score + 250);
  });

  it('awards only completed waves, with no partial role or speed bonuses on defeat', () => {
    const result = runRaid('cleanse', raidDefaults('bulwark'), WEEK, false);
    expect(result.completed).toBe(2);
    expect(result.battles.at(-1)?.outcome).toBe('loss');
    expect(result.score).toBe(4_000);
    expect(result.components).toHaveLength(1);
  });

  it('uses actual capped damage only inside the published rupture windows', () => {
    const result = runRaid('rupture', raidDefaults('rupture'), WEEK, false);
    result.battles.forEach((battle, index) => {
      const usefulDamage = battle.events.filter((event) => event.actor === 'hero' && ['attack', 'skill', 'dot'].includes(event.kind) && event.at >= 4_000 && event.at <= 8_000).reduce((sum, event) => sum + event.value, 0);
      const points = battle.combatMs <= 8_000 ? 1_000 : Math.floor(1_000 * clamp(usefulDamage / 1_800));
      expect(result.components[index + 1].points).toBe(points);
      expect(battle.damageDealt).toBe(battle.enemy.hp);
    });
  });

  it('credits defense only on the two listed heavy hits, never healing or total shields created', () => {
    const result = runRaid('bulwark', improvements[1].loadout, WEEK, false);
    expect(result.battles.some((battle) => battle.healing > 0)).toBe(true);
    result.battles.forEach((battle, index) => {
      const protection = [9_000, 18_000].map((at) => {
        if (battle.combatMs < at) return 1;
        const hit = battle.events.find((event) => event.actor === 'enemy' && event.kind === 'attack' && event.at === at)!;
        return clamp(1 - hit.value / (2 * battle.enemy.power));
      });
      expect(result.components[index + 1].points).toBe(Math.floor(500 * (protection[0] + protection[1])));
    });
  });

  it('does not award repeated or expired cleanses; counts early kills for remaining fixed effects', () => {
    const result = runRaid('cleanse', raidDefaults('cleanse'), WEEK, false);
    result.battles.forEach((battle, index) => {
      const removals = battle.events.filter((event) => event.kind === 'cleanse');
      const assessed = [6_000, 12_000, 18_000].map((at) => {
        if (battle.combatMs <= at + 4_000) return 1;
        const removal = removals.find((event) => event.at > at && event.at <= at + 4_000);
        return removal ? clamp((4 - (removal.at - at) / 1_000) / 3) : 0;
      });
      expect(assessed[0]).toBe(1);
      expect(assessed[1]).toBe(0);
      expect(assessed[2]).toBe(1);
      expect(result.components[index + 1].points).toBe(Math.floor(1_000 * assessed.reduce((sum, entry) => sum + entry, 0) / 3));
    });
  });

  it('enforces the shared simulator duration budget without adding campaign rest time to combat', () => {
    const state = createGame('duration-budget', 0);
    const enemy = { ...catalog.enemies[0], hp: 1_000_000, power: 1 };
    const battle = simulate(state, state.build, enemy, 0, { rng: 77 }, 500);
    expect(battle.combatMs).toBe(500);
    expect(battle.outcome).toBe('loss');
    expect(battle.events.at(-1)?.at).toBe(500);
    expect(battle.reason).toBe('Время боя истекло');
  });

  it('keeps every legal four-skill selection within the score and time ceilings', () => {
    for (const family of families) {
      const skills = catalog.skills.filter((skill) => skill.family === family || skill.family === 'common');
      for (let a = 0; a < skills.length; a++) for (let b = a + 1; b < skills.length; b++) for (let c = b + 1; c < skills.length; c++) for (let d = c + 1; d < skills.length; d++) {
        const selected = [skills[a], skills[b], skills[c], skills[d]];
        if (selected.filter((skill) => skill.family === family).length < 2) continue;
        const loadout = { family, skills: selected.map((skill) => skill.id), rules: [] };
        for (const role of raidRoles) {
          const result = runRaid(role.id, loadout, WEEK, false);
          expect(Number.isInteger(result.score)).toBe(true);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(10_000);
          expect(result.durationSeconds).toBeLessThanOrEqual(180);
          expect(result.battles.length).toBeLessThanOrEqual(3);
          if (result.completed < 3) expect(result.score).toBe(result.completed * 2_000);
        }
      }
    }
  });
});

describe('raid input validation', () => {
  it.each([
    ['foreign-family skill', { skills: ['shard', 'lens', 'flash', 'wedge'] }],
    ['unknown family', { family: 'unknown' as Family }],
    ['duplicate skills', { skills: ['shard', 'lens', 'lens', 'cleanse'] }],
    ['unknown skill', { skills: ['shard', 'lens', 'fake', 'cleanse'] }],
    ['too few weapon skills', { skills: ['shard', 'mend', 'barrier', 'cleanse'], rules: [] }],
    ['invalid HP threshold', { rules: [{ condition: 'hp_below', threshold: 99, skillId: 'shard' }] }],
    ['irrelevant threshold', { rules: [{ condition: 'always', threshold: 55, skillId: 'shard' }] }],
    ['unselected rule skill', { rules: [{ condition: 'always', skillId: 'cleanse' }] }],
    ['too many rules', { rules: Array.from({ length: 4 }, () => ({ condition: 'always', skillId: 'shard' })) }],
  ] as [string, Partial<RaidLoadout>][])('rejects %s before simulation', (_label, patch) => {
    expect(() => runRaid('rupture', { ...raidDefaults('rupture'), ...patch }, WEEK, false)).toThrow();
  });

  it('rejects unknown roles, invalid dates, unknown conditions and malformed arrays', () => {
    expect(() => raidDefaults('invalid' as RaidRole)).toThrow();
    expect(() => runRaid('invalid' as RaidRole, raidDefaults('rupture'), WEEK, false)).toThrow();
    for (const date of [NaN, Infinity, -1, 1.5]) expect(() => runRaid('rupture', raidDefaults('rupture'), date, false)).toThrow();
    expect(() => runRaid('rupture', { ...raidDefaults('rupture'), rules: [{ condition: 'invalid', skillId: 'shard' } as unknown as Rule] }, WEEK, false)).toThrow();
    expect(() => runRaid('rupture', { ...raidDefaults('rupture'), skills: undefined as unknown as string[] }, WEEK, false)).toThrow();
    expect(() => runRaid('rupture', { ...raidDefaults('rupture'), rules: undefined as unknown as Rule[] }, WEEK, false)).toThrow();
  });
});
