import { describe, expect, it } from 'vitest';
import { cooldownRemaining } from '../src/components/BattleSkills';
import { createGame } from '../shared/engine';
import { catalog } from '../shared/content';

describe('visible skill cooldowns', () => {
  it('uses only past hero casts, counts down and resets after another cast', () => {
    const battle = createGame('cooldowns', 1000).battle;
    const skill = catalog.skills.find(entry => entry.id === 'cut')!;
    const original = battle.events[0];
    battle.events = [
      { ...original, actor: 'hero', skillId: skill.id, at: 100 },
      { ...original, actor: 'enemy', skillId: skill.id, at: 200 },
      { ...original, actor: 'hero', skillId: skill.id, at: 20000 },
    ];
    expect(cooldownRemaining(battle, skill, 1050)).toBe(0);
    expect(cooldownRemaining(battle, skill, 1300)).toBe(skill.cooldown * 1000 - 200);
    expect(cooldownRemaining(battle, skill, 20999)).toBe(0);
    expect(cooldownRemaining(battle, skill, 21000)).toBe(skill.cooldown * 1000);
  });
});
