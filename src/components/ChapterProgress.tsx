import { ArrowRight, Check, ChevronDown, Coins, Layers3, ScrollText } from 'lucide-react';
import { chapterTasks } from '../../shared/chapter';
import type { GameView } from '../../shared/types';

export default function ChapterProgress({ view, go }: {
  view: GameView;
  go: (page: 'journey' | 'hero' | 'workshop' | 'map') => void;
}) {
  const completed = view.state.chapter.completed;
  const next = chapterTasks.find(task => !completed.includes(task.id));
  return (
    <>
      <div className="section-title">
        <h2>Первые стежки</h2>
        <span className="micro-label">{completed.length} / {chapterTasks.length}</span>
      </div>
      {next ? (
        <div className="chapter-current">
          <ScrollText size={25} />
          <div>
            <h3>{next.title}</h3>
            <p>{next.objective}{next.id === 'level10' ? ` · ${view.state.level} / 10` : ''}</p>
            <div className="chapter-reward" aria-label="Награда за поручение">
              <span><Coins size={14} /> {next.reward.coins}</span>
              <span><Layers3 size={14} /> {next.reward.thread}</span>
            </div>
          </div>
          {next.destination !== 'journey' && (
            <button className="text-button" onClick={() => go(next.destination)}>
              {next.action} <ArrowRight size={15} />
            </button>
          )}
        </div>
      ) : (
        <div className="chapter-current"><Check size={25} /><div><h3>Проводник Белых террас</h3><p>Первые стежки завершены.</p></div><button className="text-button" onClick={() => go('map')}>К маршрутам <ArrowRight size={15} /></button></div>
      )}
      <div className="thin-progress" role="progressbar" aria-label="Поручения пролога" aria-valuenow={completed.length} aria-valuemin={0} aria-valuemax={chapterTasks.length}>
        <span style={{ width: `${completed.length / chapterTasks.length * 100}%` }} />
      </div>
      <details className="chapter-list">
        <summary>Поручения террас <ChevronDown size={15} /></summary>
        <ol>
          {chapterTasks.map((task, index) => {
            const done = completed.includes(task.id);
            return (
              <li key={task.id} className={done ? 'completed' : ''}>
                <span className="chapter-check" aria-label={done ? 'Завершено' : 'Не завершено'}>{done ? <Check size={15} /> : index + 1}</span>
                <div><b>{task.title}</b><p>{task.objective}</p></div>
                {done ? <span className="chapter-receipt">Награда получена</span> : <button className="icon-button" title={task.action} aria-label={`${task.action}: ${task.title}`} onClick={() => go(task.destination)}><ArrowRight size={16} /></button>}
              </li>
            );
          })}
        </ol>
      </details>
    </>
  );
}
