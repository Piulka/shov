import type { BattleRun } from '../../shared/types';
import { BattleAudioCursor, battleSounds } from './events';

export type AudioSettings = { muted: boolean; sfx: number; ambience: number; music: number };
type Bus = 'sfx' | 'ambience' | 'music';
type Asset = { assetId: string; bus: Bus; sources: { src: string; type: string }[]; loop?: { startSample: number; endSample: number }; sampleRate: number };
const defaults: AudioSettings = { muted: true, sfx: 0.38, ambience: 0.28, music: 0 };
export function readAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('shov-audio-v1') || '{}');
    const level = (key: Bus) => typeof saved[key] === 'number' && Number.isFinite(saved[key]) ? Math.max(0, Math.min(1, saved[key])) : defaults[key];
    return { muted: typeof saved.muted === 'boolean' ? saved.muted : true, sfx: level('sfx'), ambience: level('ambience'), music: level('music') };
  } catch { return { ...defaults }; }
}

class GameAudio {
  settings = readAudioSettings();
  private context?: AudioContext;
  private master?: GainNode;
  private buses?: Record<Bus, GainNode>;
  private assets = new Map<string, Asset>();
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | undefined>>();
  private manifest?: Promise<void>;
  private cursor = new BattleAudioCursor();
  private recent = new Map<string, number>();
  private voices = new Map<AudioBufferSourceNode, boolean>();
  private loops = new Set<AudioBufferSourceNode>();
  private loop?: { id: string; source: AudioBufferSourceNode; gain: GainNode };
  private region = 'terraces';
  private generation = 0;
  private active = true;
  private unlocked = false;

  configure(settings: AudioSettings) {
    this.settings = settings;
    try { localStorage.setItem('shov-audio-v1', JSON.stringify(settings)); } catch { /* Private browsing can disable storage. */ }
    this.applyGains();
    if (settings.muted) this.stop();
    else if (this.unlocked) void this.startAmbience();
  }

  // Must be called directly by a trusted pointer/key handler, before any await.
  async unlock() {
    if (this.settings.muted || !this.active || document.hidden) return;
    try {
      if (!this.context) {
        const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        this.context = new Constructor();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
        this.master.connect(limiter); limiter.connect(this.context.destination);
        this.buses = { sfx: this.context.createGain(), ambience: this.context.createGain(), music: this.context.createGain() };
        for (const bus of Object.values(this.buses)) bus.connect(this.master);
      }
      this.applyGains();
      await this.context.resume();
      this.unlocked = this.context.state === 'running';
      if (!this.unlocked) return;
      await this.loadManifest();
      // Warm short clips only; regional beds are loaded on demand.
      for (const asset of this.assets.values()) if (asset.bus === 'sfx') void this.load(asset);
      await this.startAmbience();
    } catch { this.unlocked = false; /* A later gesture can retry a rejected resume. */ }
  }

  private applyGains() {
    if (!this.context || !this.master || !this.buses) return;
    const at = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted || !this.active || document.hidden ? 0 : 0.8, at, 0.02);
    for (const bus of ['sfx', 'ambience', 'music'] as const) this.buses[bus].gain.setTargetAtTime(this.settings[bus], at, 0.03);
  }

  private async loadManifest() {
    this.manifest ??= fetch('/audio/audio.json').then(async response => {
      if (!response.ok) throw new Error('Audio manifest unavailable');
      const data = await response.json();
      if (data.schema !== 'shov.audio.v1' || !Array.isArray(data.assets)) throw new Error('Invalid audio manifest');
      for (const asset of data.assets as Asset[]) this.assets.set(asset.assetId, asset);
    }).catch(error => { this.manifest = undefined; throw error; });
    return this.manifest;
  }

  private load(asset: Asset): Promise<AudioBuffer | undefined> {
    if (this.buffers.has(asset.assetId)) return Promise.resolve(this.buffers.get(asset.assetId));
    const existing = this.pending.get(asset.assetId);
    if (existing) return existing;
    const task = (async () => {
      const probe = document.createElement('audio');
      const sources = [...asset.sources].sort((a, b) => Number(!!probe.canPlayType(b.type)) - Number(!!probe.canPlayType(a.type)));
      for (const source of sources) {
        try {
          const response = await fetch(`/audio/${source.src}`);
          if (!response.ok || !this.context) continue;
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          if (asset.loop) {
            // Codec delay/padding can differ between WebViews. Blend the final
            // 20 ms into the decoded start, avoiding an AAC/Vorbis boundary click.
            const end = Math.min(buffer.length, Math.round(asset.loop.endSample / asset.sampleRate * buffer.sampleRate));
            const blend = Math.min(Math.round(buffer.sampleRate * 0.02), Math.floor(end / 2));
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const samples = buffer.getChannelData(channel);
              const start = Math.round(asset.loop.startSample / asset.sampleRate * buffer.sampleRate);
              for (let i = 0; i < blend; i++) {
                const weight = (i + 1) / blend;
                samples[end - blend + i] = samples[end - blend + i] * (1 - weight) + samples[start] * weight;
              }
            }
          }
          this.buffers.set(asset.assetId, buffer);
          return buffer;
        } catch { /* Try the alternative codec, never block gameplay. */ }
      }
      return undefined;
    })().finally(() => this.pending.delete(asset.assetId));
    this.pending.set(asset.assetId, task);
    return task;
  }

  private get audible() { return this.unlocked && this.active && !document.hidden && !this.settings.muted && this.context?.state === 'running'; }

  play(id: string) {
    if (!this.audible || !this.context || !this.buses || this.settings.sfx === 0) return;
    const at = performance.now();
    const interval = id === 'sfx.dot' ? 900 : id === 'sfx.victory' ? 12000 : 100;
    if (at - (this.recent.get(id) ?? -Infinity) < interval) return;
    this.recent.set(id, at);
    const variants = this.assets.has(id) ? [id] : [1, 2, 3].map(n => `${id}.${String(n).padStart(2, '0')}`).filter(key => this.assets.has(key));
    const selected = variants[Math.floor(Math.random() * variants.length)];
    const asset = this.assets.get(selected);
    if (!asset) return;
    const buffer = this.buffers.get(selected);
    if (!buffer) { void this.load(asset); return; } // Never play stale events after a download.
    const ui = id.startsWith('sfx.ui.') || id.startsWith('sfx.item.');
    if ([...this.voices.values()].filter(value => value === ui).length >= (ui ? 2 : 8)) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.buses.sfx);
    source.onended = () => { this.voices.delete(source); source.disconnect(); };
    this.voices.set(source, ui); source.start();
  }

  update(battle: BattleRun, now: number, journey: boolean) {
    if ((battle.regionId || 'terraces') !== this.region) {
      this.region = battle.regionId || 'terraces';
      void this.startAmbience();
    }
    for (const event of this.cursor.take(battle, now, !!this.audible && journey)) {
      for (const id of battleSounds(event, battle)) this.play(id);
    }
  }

  private async startAmbience() {
    if (!this.audible || !this.context || !this.buses) return;
    const id = `ambience.${this.region}`;
    if (this.loop?.id === id) return;
    const asset = this.assets.get(id);
    if (!asset) return;
    const version = ++this.generation;
    const buffer = await this.load(asset);
    if (!buffer || version !== this.generation || !this.audible) return;
    const at = this.context.currentTime;
    // At most a current and an outgoing bed, including rapid route changes.
    for (const source of this.loops) if (source !== this.loop?.source) { try { source.stop(); } catch {} this.loops.delete(source); }
    if (this.loop) {
      this.loop.gain.gain.cancelScheduledValues(at);
      this.loop.gain.gain.setTargetAtTime(0, at, 0.35);
      this.loop.source.stop(at + 1.5);
    }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; source.loop = true;
    source.loopStart = (asset.loop?.startSample || 0) / asset.sampleRate;
    source.loopEnd = Math.min(buffer.duration, (asset.loop?.endSample || buffer.length) / asset.sampleRate);
    source.connect(gain); gain.connect(this.buses.ambience);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(1, at + 1.5);
    this.loops.add(source);
    source.onended = () => { this.loops.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(); this.loop = { id, source, gain };
    for (const key of this.buffers.keys()) if (key.startsWith('ambience.') && key !== id) this.buffers.delete(key);
  }

  private stop() {
    ++this.generation;
    for (const source of [...this.voices.keys(), ...this.loops]) { try { source.stop(); } catch {} }
    this.voices.clear(); this.loops.clear(); this.loop = undefined;
  }

  setActive(active: boolean) {
    this.active = active;
    this.cursor.reset();
    if (!active || document.hidden) { this.stop(); void this.context?.suspend().catch(() => {}); }
    else if (this.unlocked && !this.settings.muted) void this.unlock();
    this.applyGains();
  }
}

export const gameAudio = new GameAudio();
