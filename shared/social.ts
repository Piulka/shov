import type { RaidLoadout, RaidResult, RaidRole } from './raid';

export type ClanRole = 'leader' | 'officer' | 'member';
export type ClanTag = 'calm' | 'builds' | 'competitive';
export interface ClanSummary {
  id: string;
  name: string;
  description: string;
  language: 'ru' | 'en';
  tag: ClanTag;
  recruitment: 'open' | 'closed';
  members: number;
  capacity: number;
  createdAt: number;
  weekScore: number;
}
export interface ClanMember {
  id: string;
  name: string;
  role: ClanRole;
  joinedAt: number;
  raidRole: RaidRole | null;
  bestScore: number;
  attemptsUsed: number;
}
export interface ClanMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  text: string;
  kind: 'message' | 'event';
  createdAt: number;
  canDelete: boolean;
}
export interface ClanDetail extends ClanSummary {
  roster: ClanMember[];
  messages: ClanMessage[];
  myRole: ClanRole;
  raidSeats: number;
  roles: { role: RaidRole; score: number; contributors: number }[];
  achievements: { weekStart: number; threshold: number }[];
}
export interface SocialView {
  now: number;
  eligible: boolean;
  unlockLevel: number;
  profile: { id: string; name: string; reputation: number };
  week: { id: string; start: number; end: number; title: string };
  clan: ClanDetail | null;
  listings: ClanSummary[];
  leaderboard: { rank: number; clan: ClanSummary; score: number }[];
  personalRaid: {
    clanId: string;
    clanName: string;
    role: RaidRole;
    attemptsUsed: number;
    bestScore: number;
    pendingReputation: number;
    lastResult: RaidResult | null;
  } | null;
  history: { weekStart: number; clanName: string; bestScore: number; reputation: number }[];
}
export type SocialCommand =
  | { type: 'profile'; name: string }
  | { type: 'create'; name: string; description: string; language: 'ru' | 'en'; tag: ClanTag }
  | { type: 'join'; clanId: string }
  | { type: 'leave'; clanId: string }
  | { type: 'settings'; clanId: string; description: string; recruitment: 'open' | 'closed' }
  | { type: 'role'; clanId: string; memberId: string; role: 'officer' | 'member' }
  | { type: 'kick'; clanId: string; memberId: string }
  | { type: 'transfer'; clanId: string; memberId: string }
  | { type: 'message'; clanId: string; text: string }
  | { type: 'delete_message'; clanId: string; messageId: string }
  | { type: 'raid'; clanId: string; weekStart: number; role: RaidRole; loadout: RaidLoadout };
