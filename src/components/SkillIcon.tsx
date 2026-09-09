import { ArrowUpRight, Axe, Crosshair, Flame, Heart, HeartPulse, Shield, ShieldCheck, ShieldPlus, Snowflake, Sparkles, Sword, Swords, Target, WandSparkles, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  ringing: Sword, wedge: Shield, counter: ShieldCheck, fracture: Axe,
  shard: Flame, lens: Snowflake, flash: WandSparkles, shell: ShieldPlus,
  stitch: ArrowUpRight, spool: Crosshair, fasten: HeartPulse, cut: Target,
  mend: Heart, barrier: ShieldPlus, cleanse: Sparkles, hush: Swords,
};
export default function SkillIcon({ id, size = 22 }: { id: string; size?: number }) {
  const Icon = icons[id] ?? ArrowUpRight;
  return <Icon size={size} aria-hidden="true" />;
}
