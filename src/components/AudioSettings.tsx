import { useState } from 'react';
import { gameAudio, type AudioSettings as Settings } from '../audio/engine';

export default function AudioSettings() {
  const [settings, setSettings] = useState(gameAudio.settings);
  const change = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next); gameAudio.configure(next);
    if (!next.muted) void gameAudio.unlock();
  };
  return <fieldset className="audio-settings">
    <legend>Звук</legend>
    <label className="setting-row">
      <span><b>Звуки игры</b><small>Музыка и звуковые эффекты</small></span>
      <input type="checkbox" checked={!settings.muted} onChange={event => change({ muted: !event.target.checked })} />
    </label>
    {(['sfx', 'music'] as const).map(bus => <label className="setting-row audio-level" key={bus}>
      <span><b>{bus === 'sfx' ? 'Эффекты' : 'Музыка'}</b><small>{Math.round(settings[bus] * 100)}%</small></span>
      <input type="range" min="0" max="100" step="1" value={Math.round(settings[bus] * 100)} disabled={settings.muted} onChange={event => change({ [bus]: Number(event.target.value) / 100 })} />
    </label>)}
  </fieldset>;
}
