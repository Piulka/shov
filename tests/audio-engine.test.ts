import { afterEach, expect, it, vi } from 'vitest';
import type { BattleRun } from '../shared/types';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('keeps the current ambience when returning before another regional download finishes', async () => {
  const started: string[] = [];
  const decoded: string[] = [];
  const names = new Map<AudioBuffer, string>();
  const gain = () => ({
    gain: { setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} },
    connect() {}, disconnect() {},
  });
  class Context {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    createGain = gain;
    createDynamicsCompressor = () => ({ threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, connect() {} });
    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        loop: false, loopStart: 0, loopEnd: 0,
        onended: undefined as (() => void) | undefined,
        connect() {}, disconnect() {},
        start() { started.push(names.get(this.buffer!)!); },
        stop() { this.onended?.(); },
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
  vi.stubGlobal('document', { hidden: false, createElement: () => ({ canPlayType: () => 'probably' }) });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
  let finishGarden!: (response: Response) => void;
  const garden = new Promise<Response>(resolve => { finishGarden = resolve; });
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/audio/audio.json') return new Response(JSON.stringify({
      schema: 'shov.audio.v1',
      assets: ['terraces', 'glassgarden'].map(region => ({
        assetId: `ambience.${region}`, bus: 'ambience', sampleRate: 100,
        loop: { startSample: 0, endSample: 100 },
        sources: [{ src: `${region}.ogg`, type: 'audio/ogg' }],
      })),
    }));
    if (url === '/audio/glassgarden.ogg') return garden;
    return new Response('terraces');
  });
  vi.stubGlobal('fetch', fetcher);
  const { gameAudio } = await import('../src/audio/engine');
  gameAudio.configure({ muted: false, sfx: 0, ambience: 1, music: 0 });
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
  gameAudio.configure({ muted: true, sfx: 0, ambience: 1, music: 0 });
});
