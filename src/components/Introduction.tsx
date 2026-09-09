import { useState } from 'react';
import { ArrowRight, Crosshair, Shield, WandSparkles } from 'lucide-react';
import type { Family, GameCommand } from '../../shared/types';

const paths = [
  { family: 'blade' as Family, name: 'Воин', Icon: Shield, text: 'Меч, щит и стойкость в ближнем бою.' },
  { family: 'glass' as Family, name: 'Маг', Icon: WandSparkles, text: 'Заклинания, уязвимость и мощные вспышки урона.' },
  { family: 'needle' as Family, name: 'Лучник', Icon: Crosshair, text: 'Точные выстрелы и ядовитые стрелы.' },
];
export default function Introduction({ command, busy, onContinue, error }: { command: (command: GameCommand) => Promise<boolean>; busy: boolean; onContinue: () => void; error: string }) {
  const [index, setIndex] = useState(0);
  const path = paths[index];
  return <main className="introduction">
    <div className="intro-scene"><img className="intro-landscape" src="/art/fantasy/terraces.png" alt="Зелёные холмы у деревни" /><div className="intro-story"><span>Глава I · Зеленолесье</span><h1>ШОВЬ</h1><h2>Дорога приключений</h2><p>За воротами деревни тревожно: на тракте появились разбойники, а старая башня снова светится по ночам. Гильдии нужен новый герой.</p></div><img className="intro-hero" src={`/art/fantasy/hero-${path.family}.png`} alt={path.name} /></div>
    <section className="intro-choice"><h2>С чего начнётся твой путь?</h2><div className="intro-paths" role="radiogroup" aria-label="Первое оружие">{paths.map(({ name, Icon, text }, i) => <button role="radio" aria-checked={i === index} disabled={busy} key={name} onClick={() => setIndex(i)}><Icon size={24} /><b>{name}</b><span>{text}</span></button>)}</div>
      <p className="intro-note">Все три оружия уже в рюкзаке. Свой путь можно изменить в любой момент.</p>
      {error && <p role="alert" className="negative">{error}</p>}
      <button className="button primary" disabled={busy} onClick={async () => { if (await command({ type: 'preset_load', index })) onContinue(); }}>{busy ? 'Готовимся...' : 'В путь'}<ArrowRight size={18} /></button>
    </section>
  </main>;
}
