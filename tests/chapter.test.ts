import { describe, expect, it } from 'vitest';
import { awardChapter, chapterTasks } from '../shared/chapter';
import { createGame } from '../shared/engine';

describe('chapter rewards', () => {
  it('grants each receipt once regardless of completion order', () => {
    const state = createGame('chapter', 0);
    const before = { ...state.wallet };
    const expected = { ...before };
    for (const task of [...chapterTasks].reverse()) {
      const reward = awardChapter(state, task.id);
      for (const key of ['coins', 'thread', 'catalyst'] as const) expected[key] += task.reward[key];
      reward.coins = -10;
      expect(awardChapter(state, task.id)).toEqual({ coins: 0, thread: 0, catalyst: 0 });
    }
    expect(state.wallet).toEqual(expected);
    expect(state.chapter.completed).toHaveLength(chapterTasks.length);
    expect(chapterTasks[0].reward.coins).toBe(200);
  });

  it('does not issue introductory grants to migrated characters', () => {
    const state = createGame('legacy', 0);
    state.chapter.legacy = true;
    const before = structuredClone(state);
    for (const task of chapterTasks) awardChapter(state, task.id);
    expect(state).toEqual(before);
  });
});
