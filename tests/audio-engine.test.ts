import { afterEach, expect, it, vi } from 'vitest';
import type { BattleRun } from '../shared/types';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('keeps current music on rapid route changes, stops it independently and resumes after hiding', async () => {
  const started: string[] = [];
  const decoded: string[] = [];
  const names = new Map<AudioBuffer, string>();
  const levels: number[][] = [];
  const gain = () => {
    const calls: number[] = []; levels.push(calls);
    return {
    gain: { setTargetAtTime(value: number) { calls.push(value); }, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} },
    connect() {}, disconnect() {},
    };
  };
  const stopped: string[] = [];
  let suspended = 0;
  class Context {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    suspend = async () => { suspended++; };
    createGain = gain;
    createDynamicsCompressor = () => ({ threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, connect() {} });
    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        loop: false, loopStart: 0, loopEnd: 0,
        onended: undefined as (() => void) | undefined,
        connect() {}, disconnect() {},
        start() { started.push(names.get(this.buffer!)!); },
        stop() { stopped.push(names.get(this.buffer!)!); this.onended?.(); },
      };
    }
    async decodeAudioData(bytes: ArrayBuffer) {
      const name = new TextDecoder().decode(bytes);
      const buffer = { length: 100, duration: 1, sampleRate: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100) } as unknown as AudioBuffer;
      names.set(buffer, name);
      decoded.push(name);
      return buffer;
    }
  }
  vi.stubGlobal('window', { AudioContext: Context });
  const documentState = { hidden: false, createElement: () => ({ canPlayType: () => 'probably' }) };
  vi.stubGlobal('document', documentState);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
  let finishGarden!: (response: Response) => void;
  const garden = new Promise<Response>(resolve => { finishGarden = resolve; });
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/audio/audio.json') return new Response(JSON.stringify({
      schema: 'shov.audio.v1',
      assets: ['terraces', 'glassgarden'].map(region => ({
        assetId: `music.${region}`, bus: 'music', sampleRate: 100,
        loop: { startSample: 0, endSample: 100 },
        sources: [{ src: `${region}.ogg`, type: 'audio/ogg' }],
      })),
    }));
    if (url === '/audio/glassgarden.ogg') return garden;
    return new Response('terraces');
  });
  vi.stubGlobal('fetch', fetcher);
  const { gameAudio } = await import('../src/audio/engine');
  gameAudio.configure({ muted: false, sfx: 0, ambience: 1, music: 0.3 });
  await gameAudio.unlock();
  expect(started).toEqual(['terraces']);
  const battle = { startedAt: 1000, family: 'blade', enemy: { id: 'porcelain' }, events: [] } as unknown as BattleRun;
  gameAudio.update({ ...battle, regionId: 'glassgarden' }, 1000, true);
  expect(fetcher).toHaveBeenCalledWith('/audio/glassgarden.ogg');
  gameAudio.update({ ...battle, regionId: 'terraces' }, 1001, true);
  finishGarden(new Response('glassgarden'));
  await vi.waitFor(() => expect(decoded).toContain('glassgarden'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(started).toEqual(['terraces']);
  gameAudio.configure({ muted: false, sfx: 0.4, ambience: 1, music: 0.17 });
  expect(levels[3].at(-1)).toBe(0.17);
  expect(levels[1].at(-1)).toBe(0.4);
  expect(started).toEqual(['terraces']);
  gameAudio.configure({ muted: false, sfx: 0.4, ambience: 1, music: 0 });
  expect(stopped).toEqual(['terraces']);
  expect(levels[1].at(-1)).toBe(0.4);
  gameAudio.configure({ muted: false, sfx: 0.4, ambience: 1, music: 0.3 });
  await vi.waitFor(() => expect(started).toHaveLength(2));
  documentState.hidden = true;
  gameAudio.setActive(false);
  expect(stopped).toHaveLength(2);
  expect(suspended).toBe(1);
  await gameAudio.unlock();
  expect(started).toHaveLength(2);
  documentState.hidden = false;
  gameAudio.setActive(true);
  await vi.waitFor(() => expect(started).toHaveLength(3));
  gameAudio.configure({ muted: true, sfx: 0.4, ambience: 1, music: 0.3 });
  expect(stopped).toHaveLength(3);
});

it('introduces music for old settings while preserving master mute and later music silence', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  const { readAudioSettings, gameAudio } = await import('../src/audio/engine');
  expect(readAudioSettings()).toMatchObject({ muted: true, music: 0.3 });
  values.set('shov-audio-v1', JSON.stringify({ muted: true, sfx: 0.21, ambience: 0, music: 0 }));
  expect(readAudioSettings()).toEqual({ muted: true, sfx: 0.21, ambience: 0, music: 0.3 });
  values.set('shov-audio-v1', JSON.stringify({ muted: false, sfx: 0.21, ambience: 0, music: 0 }));
  expect(readAudioSettings()).toMatchObject({ muted: false, music: 0.3 });
  gameAudio.configure({ muted: true, sfx: 0.21, ambience: 0, music: 0 });
  expect(JSON.parse(values.get('shov-audio-v2')!).music).toBe(0);
  expect(readAudioSettings()).toMatchObject({ muted: true, music: 0 });
  values.set('shov-audio-v2', JSON.stringify({ muted: false, sfx: -5, music: 5 }));
  expect(readAudioSettings()).toMatchObject({ muted: false, sfx: 0, music: 1 });
});
