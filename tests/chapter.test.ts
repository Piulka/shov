import { describe, expect, it } from 'vitest';
import { availableChapterTasks, awardChapter, awardProgressChapters, chapterTasks } from '../shared/chapter';
import { createGame, settle } from '../shared/engine';

describe('chapter rewards', () => {
  it('grants each receipt once regardless of completion order', () => {
    const state = createGame('chapter', 0);
    state.level = 100;
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
    for (const task of chapterTasks.filter(task => task.phase === 'prologue')) awardChapter(state, task.id);
    expect(state).toEqual(before);
  });

  it('opens adventure goals at level ten and keeps them available for legacy players', () => {
    const state = createGame('chapter', 0);
    expect(availableChapterTasks(state)).toHaveLength(7);
    state.level = 10;
    expect(availableChapterTasks(state).some(task => task.id === 'level100')).toBe(true);
    state.chapter.legacy = true;
    expect(availableChapterTasks(state).every(task => task.phase === 'adventure')).toBe(true);
  });

  it('awards previously reached level, boss and region goals to legacy heroes once', () => {
    const state = createGame('legacy', 0);
    state.chapter.legacy = true;
    state.level = 100;
    state.routeWins = { tower: 1, glasswood: 2, heartwood: 3, carmine: 1, floodgate: 1 };
    const reward = awardProgressChapters(state);
    expect(reward.catalyst).toBeGreaterThan(0);
    expect(state.chapter.completed).toEqual(expect.arrayContaining(['first_boss', 'frost_region', 'frost_boss', 'ash_region', 'dragon_boss', 'level100']));
    expect(state.chapter.completed).not.toContain('level10');
    expect(state.chapter.completed).not.toContain('reforge');
    const persisted = JSON.parse(JSON.stringify(state));
    expect(awardProgressChapters(persisted)).toEqual({ coins: 0, thread: 0, catalyst: 0 });
    expect(persisted).toEqual(state);
  });

  it('keeps milestone rewards identical across one offline settlement and repeated settlements', () => {
    const once = createGame('chapter', 0, 771);
    once.level = 15;
    once.chapter.legacy = true;
    const often = structuredClone(once);
    const report = settle(once, 3_600_000);
    let coins = 0;
    for (let minute = 1; minute <= 60; minute++) coins += settle(often, minute * 60_000).rewards.coins;
    expect(often).toEqual(once);
    expect(coins).toBe(report.rewards.coins);
    expect(once.chapter.completed).toEqual(['level15']);
    const wallet = { ...once.wallet };
    expect(settle(once, 3_600_000).rewards.coins).toBe(0);
    expect(once.wallet).toEqual(wallet);
  });
});
