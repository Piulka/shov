import type { ChapterTaskId } from '../shared/chapter';

export type Page = 'journey' | 'hero' | 'workshop' | 'map' | 'clan';
export type PageAnchor = 'equipment' | 'inventory' | 'build' | 'presets' | 'upgrade' | 'craft' | 'routes' | 'target';
export type Navigate = (page: Page, anchor?: PageAnchor) => void;

export const chapterAnchors: Partial<Record<ChapterTaskId, PageAnchor>> = {
  equip: 'inventory', upgrade: 'upgrade', craft: 'craft', tactics: 'build', target: 'target',
};

export function revealAnchor(anchor: PageAnchor): HTMLElement | null {
  const target = document.getElementById(anchor);
  if (!target) return null;
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true;
  }
  return target;
}
