import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Original, sample-free placeholder score and effects. Running this generator
// replaces only the fantasy exports and active manifest; v1 media stays intact.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/audio');
const sampleRate = 24_000;
const tau = Math.PI * 2;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const compressed = spawnSync(ffmpeg, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0;
const assets = [];
const measures = [];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const sine = (hz, time) => Math.sin(tau * hz * time);
function randomFor(name) {
  let state = createHash('sha256').update(name).digest().readUInt32LE(0) || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}
function pcm(seconds, channels = 1) { return Array.from({ length: channels }, () => new Float32Array(Math.round(seconds * sampleRate))); }
function envelope(time, duration, attack, decay = duration / 2) {
  return Math.min(1, time / attack) * Math.exp(-time / decay) * Math.min(1, Math.max(0, duration - time) / 0.03);
}
function addNote(data, at, midi, duration, amplitude, voice = 'lute', pan = 0) {
  const hz = frequency(midi), offset = Math.round(at * sampleRate), count = Math.round(duration * sampleRate);
  for (let i = 0; i < count; i++) {
    const time = i / sampleRate;
    const vibrato = voice === 'flute' ? Math.sin(tau * 4.2 * time) * Math.min(1, time / 0.2) * 0.0015 : 0;
    const phase = tau * hz * time + vibrato * hz;
    const tone = voice === 'flute' ? Math.sin(phase) + 0.2 * Math.sin(phase * 2) + 0.035 * Math.sin(phase * 3)
      : voice === 'bell' ? Math.sin(phase) + 0.22 * Math.sin(phase * 2) * Math.exp(-time * 8) + 0.08 * Math.sin(phase * 3)
        : voice === 'bass' ? Math.sin(phase) + 0.25 * Math.sin(phase * 2)
          : Math.sin(phase) + 0.3 * Math.sin(phase * 2) * Math.exp(-time * 9) + 0.16 * Math.sin(phase * 3) * Math.exp(-time * 12);
    const value = tone * amplitude * envelope(time, duration, voice === 'flute' ? 0.035 : 0.005, voice === 'flute' ? duration * 1.8 : duration * 0.33);
    const index = (offset + i) % data[0].length;
    data[0][index] += value * (data.length === 1 ? 1 : Math.sqrt((1 - pan) / 2));
    if (data[1]) data[1][index] += value * Math.sqrt((1 + pan) / 2);
  }
}
function drum(data, at, amplitude, high, random, pan = 0) {
  let filtered = 0;
  const offset = Math.round(at * sampleRate);
  for (let i = 0; i < sampleRate * 0.13; i++) {
    const time = i / sampleRate, noise = random() * 2 - 1;
    filtered += 0.2 * (noise - filtered);
    const value = amplitude * (high ? (noise - filtered) * Math.exp(-time * 60) : sine(92 - time * 200, time) * Math.exp(-time * 30) + filtered * Math.exp(-time * 55) * 0.6) * Math.min(1, time / 0.001);
    const index = (offset + i) % data[0].length;
    data[0][index] += value * Math.sqrt((1 - pan) / 2);
    data[1][index] += value * Math.sqrt((1 + pan) / 2);
  }
}

const scores = {
  terraces: {
    bpm: 120, base: 62, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 3, 5, 4, 0, 3, 4, 0],
    melody: [[4, 2, 1, 2, 4, 5, 4, 2], [3, 4, 5, 7, 5, 4, 3, 2], [5, 4, 2, 1, 2, 4, 5, 4], [4, 2, 1, 0, 1, 2, 1, 4]],
    voice: 'flute', bass: 0.12, title: 'Greenwood Adventure',
  },
  glassgarden: {
    bpm: 108, base: 67, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 5, 3, 4, 0, 3, 5, 4],
    melody: [[7, 6, 4, 2, 4, 6, 7, 4], [5, 4, 2, 1, 2, 4, 5, 7], [3, 4, 5, 4, 2, 1, 3, 2], [4, 2, 1, 4, 2, 1, 0, 4]],
    voice: 'bell', bass: 0.08, title: 'Crystal Mountain Trail',
  },
  carmine: {
    bpm: 112, base: 62, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 3, 4, 0, 5, 4, 0],
    melody: [[0, 2, 4, 5, 4, 2, 1, 2], [5, 4, 2, 1, 2, 4, 5, 4], [3, 4, 5, 7, 5, 4, 3, 2], [4, 2, 1, 0, 1, 2, 4, 1]],
    voice: 'lute', bass: 0.16, title: 'Ashland Expedition',
  },
};

function music(region) {
  const score = scores[region], beat = 60 / score.bpm, data = pcm(64 * beat, 2), random = randomFor(region);
  const note = degree => score.base + score.scale[((degree % 7) + 7) % 7] + Math.floor(degree / 7) * 12;
  for (let bar = 0; bar < 16; bar++) {
    const at = bar * 4 * beat, chord = score.chords[bar % 8];
    for (let step = 0; step < 8; step++) {
      const degree = chord + [0, 2, 4, 2, 0, 2, 4, 2][step];
      addNote(data, at + step * beat / 2, note(degree), beat * 0.8, 0.085, 'lute', step % 2 ? 0.3 : -0.3);
      // Breathing spaces and a held cadence keep repeated listening comfortable.
      if ((bar % 4 === 3 && step % 2 === 1) || (bar === 15 && step > 4)) continue;
      const melody = score.melody[bar % 4][step] + (bar >= 8 && bar < 12 ? 7 : 0);
      addNote(data, at + step * beat / 2, note(melody), beat * (bar % 4 === 3 || bar === 15 ? 0.85 : 0.43), 0.115, score.voice, -0.07);
    }
    for (let step = 0; step < 4; step++) {
      addNote(data, at + step * beat, note(chord + (step % 2 ? 4 : 0)) - 24, beat * 0.88, score.bass, 'bass', 0);
      drum(data, at + step * beat, step % 2 ? 0.026 : 0.035, step % 2 === 1, random, step % 2 ? 0.15 : 0);
    }
  }
  // A subtle stereo room tail wraps into the beginning, preserving the phrase.
  for (const channel of data) {
    const original = channel.slice(), delay = Math.round(beat * 0.75 * sampleRate);
    for (let i = 0; i < channel.length; i++) channel[i] += original[(i - delay + channel.length) % channel.length] * 0.13;
  }
  return data;
}

function effect(id, seconds) {
  const data = pcm(seconds), random = randomFor(id), variation = 0.95 + random() * 0.1;
  let low = 0, soft = 0;
  for (let i = 0; i < data[0].length; i++) {
    const time = i / sampleRate, noise = random() * 2 - 1;
    low += 0.16 * (noise - low); soft += 0.045 * (noise - soft);
    let sound = 0;
    if (id.includes('attack.blade')) {
      const strike = Math.max(0, time - 0.065);
      sound = low * Math.sin(Math.PI * Math.min(1, time / 0.15)) * Math.exp(-time * 10) * 2;
      if (time >= 0.065) sound += (sine(145 * variation, strike) * 0.65 + sine(1180 * variation, strike) * 0.17 + sine(1870, strike) * 0.08 + low * 0.5) * Math.exp(-strike * 23);
    } else if (id.includes('attack.needle')) {
      sound = (sine(165 * variation, time) + sine(332 * variation, time) * 0.5 + sine(660, time) * 0.15) * Math.exp(-time * 33);
      sound += (noise - low) * Math.sin(Math.PI * Math.min(1, time / 0.16)) * Math.exp(-time * 15) * 0.6;
    } else if (id.includes('attack.glass')) {
      sound = (sine((510 + time * 580) * variation, time) + sine((770 + time * 790) * variation, time) * 0.42) * Math.exp(-time * 9);
      sound += soft * Math.sin(Math.PI * Math.min(1, time / 0.3)) * 0.8;
    } else if (id.includes('hit.ceramic') || id.includes('heavy.impact') || id.includes('shield.absorb')) {
      sound = (sine(110 * variation, time) * 0.9 + sine(980 * variation, time) * 0.2 + sine(1550, time) * 0.08 + low * 0.9) * Math.exp(-time * 26);
    } else if (id.includes('hit.fabric')) {
      sound = (sine(105 * variation, time) * 0.85 + low * 1.1) * Math.exp(-time * 30);
    } else if (id.includes('hit.glass')) {
      sound = (sine(660 * variation, time) + sine(1320, time) * 0.2 + low * 0.6) * Math.exp(-time * 22);
    } else if (id.includes('windup')) {
      sound = (sine(90 + time * 50, time) * 0.65 + soft * 2) * Math.sin(Math.PI * time / seconds) ** 1.4;
    } else if (id.includes('defeat')) {
      sound = (sine(105 - time * 35, time) * 0.45 + low) * Math.exp(-time * 8);
      for (const offset of [0.12, 0.25]) if (time > offset) sound += low * 0.45 * Math.exp(-(time - offset) * 25);
    } else if (id.includes('salvage') || id.includes('craft') || id.includes('reforge')) {
      for (const offset of [0, 0.09, 0.21]) if (time >= offset) {
        const strike = time - offset;
        sound += (sine(1100 * variation, strike) * 0.3 + sine(215 * variation, strike) * 0.75 + low * 1.2) * Math.exp(-strike * 32);
      }
    } else if (id.includes('dot')) {
      sound = (sine(290 - time * 470, time) * 0.8 + soft) * Math.exp(-time * 32);
    } else if (id.includes('click') || id.includes('lock') || id.includes('equip')) {
      sound = (sine(id.includes('equip') ? 760 : 560, time) * 0.6 + low * 0.5) * Math.exp(-time * 65);
    } else {
      const falling = /retreat|reject|back/.test(id);
      const healing = /heal|cleanse|shield.raise/.test(id);
      const notes = falling ? [67, 63, 60] : healing ? [76, 79, 83, 88] : [72, 76, 79, 84];
      for (let n = 0; n < notes.length; n++) {
        const delay = n * Math.min(0.105, seconds / (notes.length + 3));
        if (time < delay) continue;
        const age = time - delay, hz = frequency(notes[n]);
        sound += (sine(hz, age) + sine(hz * 2, age) * 0.18) * envelope(age, seconds - delay, 0.004, healing ? 0.12 : 0.07) * 0.4;
      }
    }
    data[0][i] = sound * Math.min(1, time / 0.002) * Math.min(1, (seconds - time) / 0.012);
  }
  return data;
}

function wav(data) {
  const channels = data.length, size = data[0].length * channels * 2, bytes = Buffer.alloc(44 + size);
  bytes.write('RIFF'); bytes.writeUInt32LE(size + 36, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * 2, 28); bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(size, 40);
  for (let i = 0; i < data[0].length; i++) for (let channel = 0; channel < channels; channel++) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[channel][i])) * 32767), 44 + (i * channels + channel) * 2);
  return bytes;
}

async function exportAsset(assetId, bus, data, peakDb, title) {
  let peak = 0;
  for (const channel of data) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = 10 ** (peakDb / 20) / Math.max(peak, 0.00001);
  let sum = 0;
  for (const channel of data) for (let i = 0; i < channel.length; i++) { channel[i] *= gain; sum += channel[i] ** 2; }
  const relative = `fantasy/${bus}/${assetId.replaceAll('.', '-')}`, wavPath = resolve(output, `${relative}.wav`);
  await mkdir(resolve(output, `fantasy/${bus}`), { recursive: true });
  await writeFile(wavPath, wav(data));
  const sources = [];
  if (compressed) {
    for (const [extension, codec, quality, type] of [['ogg', 'libvorbis', ['-q:a', '4'], 'audio/ogg; codecs=vorbis'], ['m4a', 'aac', ['-b:a', bus === 'music' ? '96k' : '64k'], 'audio/mp4']]) {
      const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath, '-c:a', codec, ...quality, resolve(output, `${relative}.${extension}`)], { windowsHide: true, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Audio export failed: ${assetId} (${result.stderr})`);
      sources.push({ src: `${relative}.${extension}`, type });
    }
  } else sources.push({ src: `${relative}.wav`, type: 'audio/wav' });
  const duration = data[0].length / sampleRate;
  assets.push({ assetId, bus, sources, sampleRate, channels: data.length, duration, gainDb: 0, placeholder: true, ...(title ? { title } : {}), ...(bus === 'music' ? { loop: { startSample: 0, endSample: data[0].length } } : {}) });
  measures.push({ assetId, peakDbfs: peakDb, rmsDbfs: Number((10 * Math.log10(sum / (data[0].length * data.length))).toFixed(2)), duration, pcmSeamDelta: bus === 'music' ? Math.max(...data.map(channel => Math.abs(channel[0] - channel.at(-1)))) : null });
}

const previous = JSON.parse(await readFile(resolve(output, 'audio.json'), 'utf8'));
const effects = previous.assets.filter(asset => asset.bus === 'sfx');
for (const [region, score] of Object.entries(scores)) await exportAsset(`music.${region}`, 'music', music(region), -10, score.title);
for (const asset of effects) {
  const isUI = /sfx\.(ui|item)\./.test(asset.assetId);
  const duration = asset.assetId.includes('attack.') ? 0.34 : Math.max(asset.duration, 0.08);
  await exportAsset(asset.assetId, 'sfx', effect(asset.assetId, duration), isUI ? -17 : asset.assetId.includes('windup') ? -15 : -10);
}
await writeFile(resolve(output, 'audio.json'), `${JSON.stringify({ schema: 'shov.audio.v1', revision: 2, style: 'colorful-fantasy', assets }, null, 2)}\n`);
await writeFile(resolve(output, 'fantasy/measurements.json'), `${JSON.stringify({ generator: 'tools/generate-fantasy-audio.mjs', sampleRate, codec: compressed ? 'ogg+m4a' : 'wav-pcm16', measurements: measures }, null, 2)}\n`);
console.log(`Generated ${assets.length} original fantasy cues (${compressed ? 'OGG + M4A' : 'PCM WAV fallback: ffmpeg not found'}). Original v1 media preserved.`);
