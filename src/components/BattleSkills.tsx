import type { BattleRun, Skill } from '../../shared/types';
import SkillIcon from './SkillIcon';

export function cooldownRemaining(battle: BattleRun, skill: Skill, now: number): number {
  const elapsed = Math.max(0, now - battle.startedAt);
  const last = battle.events.findLast(event => event.actor === 'hero' && event.skillId === skill.id && event.at <= elapsed);
  return last ? Math.max(0, last.at + skill.cooldown * 1000 - elapsed) : 0;
}

export default function BattleSkills({ battle, skills, now }: { battle: BattleRun; skills: Skill[]; now: number }) {
  const resting = now >= battle.startedAt + battle.combatMs;
  return <div className="battle-skills" aria-label="Умения в текущем бою">
    {skills.map(skill => {
      const remaining = cooldownRemaining(battle, skill, now);
      const label = resting ? 'Отдых' : remaining > 0 ? `${(remaining / 1000).toFixed(1)} с` : 'Готово';
      return <div className={`battle-skill family-${skill.family} ${remaining > 0 && !resting ? 'cooling' : ''}`} key={skill.id} title={`${skill.name}: ${label}. ${skill.description}`} aria-label={`${skill.name}: ${label}`}>
        <span className="battle-skill-icon"><SkillIcon id={skill.id} /><span className="cooldown-fill" style={{ height: resting ? 0 : `${remaining / (skill.cooldown * 1000) * 100}%` }} /></span>
        <span className="battle-skill-copy"><b>{skill.name}</b><small>{label}</small></span>
      </div>;
    })}
  </div>;
}
