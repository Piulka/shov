import { useEffect } from 'react';
import type { BattleRun } from '../../shared/types';
import { gameAudio } from './engine';

export function useGameAudio(battle: BattleRun | undefined, now: number, journey: boolean) {
  useEffect(() => {
    const gesture = (event: Event) => { if (event.isTrusted) void gameAudio.unlock(); };
    const click = (event: MouseEvent) => {
      if (event.isTrusted && (event.target as Element)?.closest('button:not(:disabled)')) gameAudio.play('sfx.ui.click');
    };
    let telegramActive = true;
    const visibility = () => gameAudio.setActive(!document.hidden && telegramActive);
    const activated = () => { telegramActive = true; visibility(); };
    const deactivated = () => { telegramActive = false; visibility(); };
    document.addEventListener('pointerdown', gesture);
    document.addEventListener('keydown', gesture);
    document.addEventListener('click', click);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', deactivated);
    window.addEventListener('pageshow', activated);
    const telegram = window.Telegram?.WebApp;
    telegram?.onEvent?.('activated', activated);
    telegram?.onEvent?.('deactivated', deactivated);
    visibility();
    return () => {
      document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('keydown', gesture);
      document.removeEventListener('click', click);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', deactivated);
      window.removeEventListener('pageshow', activated);
      telegram?.offEvent?.('activated', activated);
      telegram?.offEvent?.('deactivated', deactivated);
      gameAudio.setActive(false);
    };
  }, []);
  useEffect(() => { if (battle) gameAudio.update(battle, now, journey); }, [battle, now, journey]);
}
