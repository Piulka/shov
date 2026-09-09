import { ArrowRight, Check, ChevronDown, Coins, Layers3, ScrollText } from 'lucide-react';
import { availableChapterTasks } from '../../shared/chapter';
import type { GameView } from '../../shared/types';
import { chapterAnchors, type Navigate } from '../navigation';

export default function ChapterProgress({ view, go }: {
  view: GameView;
  go: Navigate;
}) {
  const completed = view.state.chapter.completed;
  const tasks = availableChapterTasks(view.state);
  const phase = view.state.level >= 10 ? 'adventure' : 'prologue';
  const currentTasks = tasks.filter(task => task.phase === phase);
  const next = currentTasks.find(task => !completed.includes(task.id));
  const doneCount = currentTasks.filter(task => completed.includes(task.id)).length;
  return (
    <>
      <div className="section-title">
        <h2>{phase === 'adventure' ? 'Задания приключения' : 'Первые шаги'}</h2>
        <span className="micro-label">{doneCount} / {currentTasks.length}</span>
      </div>
      {next ? (
        <div className="chapter-current">
          <ScrollText size={25} />
          <div>
            <h3>{next.title}</h3>
            <p>{next.objective}{next.requirement && 'level' in next.requirement ? ` · ${view.state.level} / ${next.requirement.level}` : ''}</p>
            <div className="chapter-reward" aria-label="Награда за поручение">
              <span><Coins size={14} /> {next.reward.coins}</span>
              <span><Layers3 size={14} /> {next.reward.thread}</span>
            </div>
          </div>
          {next.destination !== 'journey' && (
            <button className="text-button" onClick={() => go(next.destination, chapterAnchors[next.id])}>
              {next.action} <ArrowRight size={15} />
            </button>
          )}
        </div>
      ) : (
        <div className="chapter-current"><Check size={25} /><div><h3>Глава завершена</h3><p>{phase === 'prologue' ? 'Следующие задания откроются на 10-м уровне.' : 'Все поручения выполнены.'}</p></div><button className="text-button" onClick={() => go('map', 'routes')}>К маршрутам <ArrowRight size={15} /></button></div>
      )}
      <div className="thin-progress" role="progressbar" aria-label="Прогресс поручений" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={currentTasks.length || 1}>
        <span style={{ width: `${doneCount / Math.max(1, currentTasks.length) * 100}%` }} />
      </div>
      <details className="chapter-list">
        <summary>Все поручения <ChevronDown size={15} /></summary>
        <ol>
          {tasks.map((task, index) => {
            const done = completed.includes(task.id);
            return (
              <li key={task.id} className={done ? 'completed' : ''}>
                <span className="chapter-check" aria-label={done ? 'Завершено' : 'Не завершено'}>{done ? <Check size={15} /> : index + 1}</span>
                <div><b>{task.title}</b><p>{task.objective}</p></div>
                {done ? <span className="chapter-receipt">Награда получена</span> : <button className="icon-button" title={task.action} aria-label={`${task.action}: ${task.title}`} onClick={() => go(task.destination, chapterAnchors[task.id])}><ArrowRight size={16} /></button>}
              </li>
            );
          })}
        </ol>
      </details>
    </>
  );
}
