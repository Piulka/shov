import type { BattleEvent, BattleRun, GameCommand } from '../../shared/types';

// Track the high-water mark even while muted/hidden. Server refreshes and old reports
// must never create a backlog of sounds. The battle identity does not use labels.
export class BattleAudioCursor {
  private key = '';
  private through = -1;
  private clock = 0;
  reset() { this.key = ''; this.through = -1; }
  take(battle: BattleRun, now: number, audible: boolean): BattleEvent[] {
    const key = `${battle.startedAt}:${battle.enemy.id}:${battle.family}`;
    const elapsed = now - battle.startedAt;
    const due = battle.events.findLastIndex(event => event.at <= elapsed);
    if (key !== this.key) {
      this.key = key; this.through = due; this.clock = now;
      return [];
    }
    const fresh = battle.events.slice(this.through + 1, due + 1)
      .filter(event => elapsed - event.at <= 220);
    this.through = Math.max(this.through, due);
    const gap = now - this.clock;
    this.clock = Math.max(now, this.clock);
    return audible && gap >= 0 && gap <= 500 ? fresh : [];
  }
}

export const materialFor = (kind: BattleRun['enemy']['kind']) =>
  kind === 'shard' ? 'glass' : kind === 'weaver' ? 'fabric' : 'ceramic';

export function battleSounds(event: BattleEvent, battle: BattleRun): string[] {
  switch (event.kind) {
    case 'attack':
    case 'skill': return [
      event.actor === 'hero' ? `sfx.attack.${battle.family}` : `sfx.hit.ceramic`,
      ...(event.actor === 'hero' ? [`sfx.hit.${materialFor(battle.enemy.kind)}`] : []),
      ...(event.critical ? ['sfx.critical'] : []),
    ];
    case 'windup': return ['sfx.heavy.windup'];
    case 'shield': return ['sfx.shield.raise'];
    case 'heal': return ['sfx.heal'];
    case 'cleanse': return ['sfx.cleanse'];
    case 'dot': return ['sfx.dot'];
    case 'win': return [`sfx.defeat.${materialFor(battle.enemy.kind)}`, 'sfx.victory'];
    case 'loss': return ['sfx.retreat'];
  }
}

export function commandSound(command: GameCommand): string {
  switch (command.type) {
    case 'equip': return 'sfx.ui.equip';
    case 'lock': return 'sfx.ui.lock';
    case 'craft': return 'sfx.item.craft';
    case 'reforge': return 'sfx.item.reforge';
    case 'upgrade': return 'sfx.item.upgrade';
    case 'dismantle': return 'sfx.item.salvage';
    default: return 'sfx.ui.confirm';
  }
}
