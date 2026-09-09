import { useEffect, useRef } from 'react';
import type { BattleEvent, BattleRun } from '../../shared/types';

interface BattleSceneProps {
  battle: BattleRun;
  now: number;
  paused?: boolean;
  compact?: boolean;
}

interface Art {
  image: HTMLImageElement;
  flash: HTMLCanvasElement;
}

const filenames = [
  'terraces', 'hero-blade', 'hero-glass', 'hero-needle',
  'enemy-sentinel', 'enemy-shard', 'enemy-weaver', 'enemy-boss',
];

let cachedArt: Promise<Map<string, Art>> | undefined;
function loadArt() {
  if (!cachedArt) {
    cachedArt = Promise.all(filenames.map((name) => new Promise<[string, Art]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const flash = document.createElement('canvas');
        flash.width = image.width;
        flash.height = image.height;
        const context = flash.getContext('2d');
        if (context) {
          context.drawImage(image, 0, 0);
          context.globalCompositeOperation = 'source-in';
          context.fillStyle = '#fff5d8';
          context.fillRect(0, 0, flash.width, flash.height);
        }
        resolve([name, { image, flash }]);
      };
      image.onerror = () => reject(new Error(`Could not load art: ${name}`));
      image.src = `/art/${name}.png`;
    }))).then((entries) => new Map(entries)).catch((error: unknown) => {
      cachedArt = undefined;
      throw error;
    });
  }
  return cachedArt;
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const damaging = (event: BattleEvent) => event.kind === 'attack' || event.kind === 'skill' || event.kind === 'dot';

function drawSprite(context: CanvasRenderingContext2D, art: Art | undefined, x: number, feet: number, height: number, facing: number, bob: number, flash: number, defeated: boolean) {
  if (!art) return;
  context.save();
  context.translate(x, feet + bob);
  context.scale(facing, 1);
  if (defeated) {
    context.rotate(-0.14);
    context.globalAlpha = 0.45;
  }
  const width = height * 0.8;
  // Art has 15 pixels of transparent footing; anchor the visible feet to the floor.
  context.drawImage(art.image, -width / 2, -height * 0.935, width, height);
  if (flash > 0 && !defeated) {
    context.globalAlpha = flash * 0.72;
    context.drawImage(art.flash, -width / 2, -height * 0.935, width, height);
  }
  context.restore();
}

function drawScene(context: CanvasRenderingContext2D, art: Map<string, Art>, width: number, height: number, props: BattleSceneProps, clock: number, reducedMotion: boolean) {
  const { battle, compact } = props;
  const elapsed = Math.max(0, clock - battle.startedAt);
  const animate = !reducedMotion && !props.paused;
  const time = animate ? clock / 1000 : 0;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  const stage = art.get('terraces');
  if (stage) {
    const scale = Math.max(width / 1200, height / 600);
    context.drawImage(stage.image, (width - 1200 * scale) / 2, height - 600 * scale, 1200 * scale, 600 * scale);
  }

  const feet = height * 0.807;
  const figureHeight = Math.min(height * (compact ? 0.50 : 0.56), width * 0.43, 280);
  let heroX = width * 0.305;
  let enemyX = width * 0.71;
  const boss = battle.enemy.kind === 'boss';
  const enemyHeight = figureHeight * (boss ? 1.13 : battle.enemy.kind === 'shard' ? 0.90 : 1);
  const recent = battle.events.filter((event) => elapsed >= event.at && elapsed - event.at < 1100);
  const heroHit = recent.findLast((event) => event.actor === 'enemy' && damaging(event));
  const enemyHit = recent.findLast((event) => event.actor === 'hero' && damaging(event));
  const heroStrike = recent.findLast((event) => event.actor === 'hero' && (event.kind === 'attack' || event.kind === 'skill'));
  const enemyStrike = recent.findLast((event) => event.actor === 'enemy' && (event.kind === 'attack' || event.kind === 'skill'));
  const lunge = (event: BattleEvent | undefined) => event && animate ? Math.sin(clamp((elapsed - event.at) / 350) * Math.PI) : 0;
  heroX += lunge(heroStrike) * Math.min(figureHeight * 0.19, width * 0.055);
  enemyX -= lunge(enemyStrike) * Math.min(figureHeight * 0.16, width * 0.05);
  const flashing = (event: BattleEvent | undefined) => event && animate ? Math.max(0, 1 - (elapsed - event.at) / 210) : 0;
  const heroFlash = flashing(heroHit);
  const enemyFlash = flashing(enemyHit);
  const lastEvent = battle.events.findLast((event) => event.at <= elapsed);
  const heroLost = lastEvent?.kind === 'loss';
  const enemyLost = lastEvent?.kind === 'win';
  const windup = battle.events.findLast((event) => event.kind === 'windup' && event.at <= elapsed && elapsed - event.at < 2000);

  // Narrow contact shadows keep both subjects seated on the same perspective plane.
  for (const [x, size] of [[heroX, figureHeight], [enemyX, enemyHeight]]) {
    context.fillStyle = '#254f4b';
    context.globalAlpha = 0.18;
    context.beginPath();
    context.ellipse(x + size * 0.05, feet + 2, size * 0.26, size * 0.046, -0.12, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const heroBob = animate ? Math.sin(time * 2.7) * figureHeight * 0.006 : 0;
  const enemyBob = animate ? Math.sin(time * (battle.enemy.kind === 'shard' ? 2 : 2.4) + 1) * figureHeight * (battle.enemy.kind === 'shard' ? 0.024 : 0.006) : 0;
  drawSprite(context, art.get(`hero-${battle.family}`), heroX - heroFlash * 3, feet, figureHeight, 1, heroBob, heroFlash, heroLost);
  drawSprite(context, art.get(`enemy-${battle.enemy.kind}`), enemyX + enemyFlash * 3, feet, enemyHeight, -1, enemyBob, enemyFlash, enemyLost);

  if ((lastEvent?.heroShield ?? 0) > 0 && !heroLost) {
    context.save();
    context.strokeStyle = '#71c7c2';
    context.lineWidth = 2;
    context.globalAlpha = 0.72;
    const x = heroX + figureHeight * 0.25;
    const y = feet - figureHeight * 0.49;
    context.beginPath();
    context.moveTo(x - 7, y - figureHeight * 0.23);
    context.lineTo(x + 6, y - figureHeight * 0.15);
    context.lineTo(x + 11, y + figureHeight * 0.10);
    context.lineTo(x - 5, y + figureHeight * 0.24);
    context.stroke();
    context.restore();
  }

  if (windup && !enemyLost) {
    context.save();
    context.globalAlpha = Math.min(1, (2000 - elapsed + windup.at) / 200);
    context.fillStyle = '#a83f58';
    context.strokeStyle = '#fff0d9';
    context.lineWidth = 3;
    context.font = '700 22px system-ui, sans-serif';
    context.textAlign = 'center';
    context.strokeText('!', enemyX, feet - enemyHeight * 0.89);
    context.fillText('!', enemyX, feet - enemyHeight * 0.89);
    context.restore();
  }

  for (const event of recent.slice(-5)) {
    const age = elapsed - event.at;
    const targetX = event.actor === 'hero' ? enemyX : heroX;
    if (damaging(event) && age < 260 && animate) {
      const p = age / 260;
      const y = feet - figureHeight * 0.49;
      context.save();
      context.globalAlpha = 1 - p;
      context.strokeStyle = event.actor === 'hero' ? '#ffefae' : '#c75b72';
      context.lineWidth = event.critical ? 5 : 3;
      context.beginPath();
      if (event.actor === 'hero' && battle.family === 'glass') {
        context.strokeStyle = '#b6e7dc';
        context.moveTo(heroX + figureHeight * 0.20, y);
        context.lineTo(targetX - figureHeight * 0.12, y - 6);
        context.lineTo(targetX + figureHeight * 0.11, y + 8);
      } else if (event.actor === 'hero' && battle.family === 'needle') {
        context.moveTo(heroX + figureHeight * 0.25, y - figureHeight * 0.12);
        context.bezierCurveTo(heroX + figureHeight * 0.42, y - figureHeight * 0.46, targetX - figureHeight * 0.25, y + figureHeight * 0.35, targetX, y);
      } else {
        context.moveTo(targetX - figureHeight * 0.15, y + figureHeight * 0.14);
        context.quadraticCurveTo(targetX + figureHeight * 0.08, y, targetX + figureHeight * 0.13, y - figureHeight * 0.20);
      }
      context.stroke();
      context.fillStyle = '#fff5d0';
      for (let i = 0; i < 3; i++) context.fillRect(targetX + (i - 1) * figureHeight * 0.13 * p, y + (i % 2 ? -1 : 1) * figureHeight * 0.15 * p, 3, 3);
      context.restore();
    }
    if (event.value <= 0 || !['attack', 'skill', 'dot', 'heal', 'shield'].includes(event.kind) || age > 950) continue;
    const recovery = event.kind === 'heal' || event.kind === 'shield';
    const x = recovery ? heroX : targetX;
    const index = recent.indexOf(event);
    const y = feet - figureHeight * (0.77 + (index % 2) * 0.10) - (animate ? age / 950 * 19 : 0);
    const label = `${recovery ? '+' : ''}${Math.round(event.value)}`;
    context.save();
    context.globalAlpha = Math.min(1, (1050 - age) / 250);
    context.textAlign = 'center';
    context.font = `750 ${event.critical ? 21 : 17}px system-ui, sans-serif`;
    context.lineJoin = 'round';
    context.lineWidth = 3.5;
    context.strokeStyle = '#f6f5df';
    context.fillStyle = recovery ? '#287b65' : event.actor === 'hero' ? '#394d48' : '#a73d58';
    context.strokeText(label, x + (index % 2 ? 12 : -8), y);
    context.fillText(label, x + (index % 2 ? 12 : -8), y);
    context.restore();
  }

  if (animate) {
    // Wind-blown carmine leaves belong to the trees at the edges of the scene.
    context.save();
    for (let i = 0; i < 6; i++) {
      const cycle = (time * (0.018 + i * 0.003) + i * 0.167) % 1;
      const x = width * ((i % 2 ? 0.85 : 0.07) + cycle * 0.10 + Math.sin(time * 0.4 + i) * 0.025);
      const y = height * (0.27 + cycle * 0.49);
      context.fillStyle = i % 2 ? '#d5848c' : '#bb5d76';
      context.globalAlpha = 0.65 * Math.sin(cycle * Math.PI);
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(time + i) * 0.6);
      context.fillRect(-2, -1, 5, 2);
      context.restore();
    }
    context.restore();
  }
}

export default function BattleScene(props: BattleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ props, received: performance.now() });
  live.current = { props, received: performance.now() };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stopped = false;
    let frame = 0;
    let lastDraw = 0;
    let art: Map<string, Art> | undefined;
    let width = 0;
    let height = 0;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (art && width && height) drawScene(context, art, width, height, live.current.props, live.current.props.now, media.matches);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    void loadArt().then((loaded) => {
      if (stopped) return;
      art = loaded;
      resize();
    }).catch(() => {
      // The CSS backdrop remains visible if a WebView cannot decode an asset.
      context.clearRect(0, 0, canvas.width, canvas.height);
    });

    const tick = (timestamp: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const { props: current, received } = live.current;
      const interval = media.matches || current.paused ? 100 : 1000 / 30;
      if (!art || !width || !height || document.hidden || timestamp - lastDraw < interval) return;
      lastDraw = timestamp;
      const clock = current.now + (current.paused ? 0 : Math.min(performance.now() - received, 250));
      drawScene(context, art, width, height, current, clock, media.matches);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas
    ref={canvasRef}
    className="battle-canvas"
    role="img"
    aria-label={`Белые террасы. Ваш герой сражается: ${props.battle.enemy.name}.`}
    style={{ display: 'block', width: '100%', height: '100%', background: '#c8e7e0 url(/art/terraces.png) center bottom / cover no-repeat' }}
  />;
}
