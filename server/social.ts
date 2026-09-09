import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { migrateGame } from '../shared/engine.ts';
import { runRaid, type RaidLoadout, type RaidResult, type RaidRole } from '../shared/raid.ts';
import type { ClanDetail, ClanRole, ClanSummary, SocialCommand, SocialView } from '../shared/social.ts';
import type { GameState } from '../shared/types.ts';
import { GameStore } from './store.ts';

const day = 86_400_000;
const weekDuration = 7 * day;
const capacity = 20;
const unlockLevel = 10;
const roles: RaidRole[] = ['rupture', 'bulwark', 'cleanse'];
const identifier = z.string().uuid();
const roleSchema = z.enum(['rupture', 'bulwark', 'cleanse']);
const skillId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_:-]+$/);
const ruleSchema = z.strictObject({
  condition: z.enum(['always', 'hp_below', 'no_shield', 'enemy_windup', 'has_debuff', 'vulnerable', 'no_vulnerable', 'three_marks', 'under_three_marks']),
  threshold: z.union([z.literal(25), z.literal(40), z.literal(55), z.literal(70)]).optional(),
  skillId,
});
const loadoutSchema = z.strictObject({ family: z.enum(['blade', 'glass', 'needle']), skills: z.array(skillId).length(4), rules: z.array(ruleSchema).max(3) });
const normalized = (text: string) => text.normalize('NFKC').trim();
const nameKey = (text: string) => normalized(text).toLocaleLowerCase('ru');
const unsafeText = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const safeText = (min: number, max: number, multiline = false) => z.string().max(max * 4)
  .transform(normalized).pipe(z.string().min(min).max(max))
  .refine(text => !unsafeText.test(multiline ? text.replaceAll('\n', '') : text));
const nameSchema = (min: number) => safeText(min, 24).refine(text => /^[\p{L}\p{M}\p{N} ._'!-]+$/u.test(text));
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('profile'), name: nameSchema(2) }),
  z.strictObject({ type: z.literal('create'), name: nameSchema(3), description: safeText(0, 240, true), language: z.enum(['ru', 'en']), tag: z.enum(['calm', 'builds', 'competitive']) }),
  z.strictObject({ type: z.literal('join'), clanId: identifier }),
  z.strictObject({ type: z.literal('leave'), clanId: identifier }),
  z.strictObject({ type: z.literal('settings'), clanId: identifier, description: safeText(0, 240, true), recruitment: z.enum(['open', 'closed']) }),
  z.strictObject({ type: z.literal('role'), clanId: identifier, memberId: identifier, role: z.enum(['officer', 'member']) }),
  z.strictObject({ type: z.literal('kick'), clanId: identifier, memberId: identifier }),
  z.strictObject({ type: z.literal('transfer'), clanId: identifier, memberId: identifier }),
  z.strictObject({ type: z.literal('message'), clanId: identifier, text: safeText(1, 500, true) }),
  z.strictObject({ type: z.literal('delete_message'), clanId: identifier, messageId: identifier }),
  z.strictObject({ type: z.literal('report_message'), clanId: identifier, messageId: identifier, reason: z.enum(['spam', 'abuse', 'other']) }),
  z.strictObject({ type: z.literal('raid'), clanId: identifier, weekStart: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), role: roleSchema, loadout: loadoutSchema }),
]);
const requestIdSchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);

interface ProfileRow { account_id: string; public_id: string; name: string; last_create_at: number | null; last_message_at: number | null }
interface ClanRow { id: string; name: string; name_key: string; description: string; language: 'ru' | 'en'; tag: ClanSummary['tag']; recruitment: 'open' | 'closed'; created_at: number; archived: number }
interface MemberRow { account_id: string; clan_id: string; role: ClanRole; joined_at: number }
interface ParticipantRow { account_id: string; clan_id: string; week_start: number; role: RaidRole; attempts: number; best_score: number; last_result: string }
interface ScoreRow { clan_id: string; role: RaidRole; score: number; contributors: number }

export class SocialError extends Error {
  constructor(readonly statusCode: number, message: string, readonly code: string) { super(message); }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new SocialError(400, 'Проверьте поля команды: длину текста и выбранные значения.', 'INVALID_REQUEST');
  return parsed.data;
}

export function socialWeekStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - ((date.getUTCDay() + 6) % 7) * day;
}

function reputation(score: number): number { return 100 + (score >= 6_000 ? 100 : 0) + (score >= 9_000 ? 100 : 0); }

export class SocialService {
  constructor(private readonly store: GameStore) {
    store.database.exec(`
      CREATE TABLE IF NOT EXISTS social_profiles (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id), public_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, last_create_at INTEGER, last_message_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS social_clans (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
        language TEXT NOT NULL CHECK(language IN ('ru', 'en')), tag TEXT NOT NULL CHECK(tag IN ('calm', 'builds', 'competitive')),
        recruitment TEXT NOT NULL CHECK(recruitment IN ('open', 'closed')), created_at INTEGER NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS social_members (
        account_id TEXT PRIMARY KEY REFERENCES social_profiles(account_id), clan_id TEXT NOT NULL REFERENCES social_clans(id),
        role TEXT NOT NULL CHECK(role IN ('leader', 'officer', 'member')), joined_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_members_clan ON social_members(clan_id);
      CREATE UNIQUE INDEX IF NOT EXISTS social_clan_leader ON social_members(clan_id) WHERE role = 'leader';
      CREATE TABLE IF NOT EXISTS social_messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, clan_id TEXT NOT NULL REFERENCES social_clans(id),
        author_id TEXT REFERENCES social_profiles(public_id), author_name TEXT NOT NULL, text TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('message', 'event')), created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_messages_clan ON social_messages(clan_id, sequence DESC);
      CREATE TABLE IF NOT EXISTS social_participation (
        account_id TEXT NOT NULL REFERENCES social_profiles(account_id), week_start INTEGER NOT NULL,
        clan_id TEXT NOT NULL REFERENCES social_clans(id), role TEXT NOT NULL CHECK(role IN ('rupture', 'bulwark', 'cleanse')),
        attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 3), best_score INTEGER NOT NULL CHECK(best_score BETWEEN 0 AND 10000),
        last_result TEXT NOT NULL CHECK(json_valid(last_result)), PRIMARY KEY(account_id, week_start)
      );
      CREATE INDEX IF NOT EXISTS social_participation_clan ON social_participation(clan_id, week_start);
      CREATE TABLE IF NOT EXISTS social_raid_attempts (
        account_id TEXT NOT NULL REFERENCES social_profiles(account_id), week_start INTEGER NOT NULL,
        attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 3), clan_id TEXT NOT NULL REFERENCES social_clans(id),
        role TEXT NOT NULL CHECK(role IN ('rupture', 'bulwark', 'cleanse')), loadout TEXT NOT NULL CHECK(json_valid(loadout)),
        result TEXT NOT NULL CHECK(json_valid(result)), rules_version INTEGER NOT NULL, submitted_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, week_start, attempt_number)
      );
      CREATE TABLE IF NOT EXISTS social_commands (
        account_id TEXT NOT NULL REFERENCES social_profiles(account_id), command_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(account_id, command_id)
      );
    `);
  }

  private get db() { return this.store.database; }

  private profile(accountId: string): { row: ProfileRow; eligible: boolean } {
    const saved = this.store.getGame(accountId);
    if (!saved) throw new SocialError(401, 'Сохранение аккаунта не найдено.', 'UNAUTHORIZED');
    const state = JSON.parse(saved.snapshot) as GameState;
    migrateGame(state);
    let row = this.db.prepare('SELECT * FROM social_profiles WHERE account_id = ?').get(accountId) as unknown as ProfileRow | undefined;
    if (!row) {
      const publicId = randomUUID();
      this.db.prepare('INSERT INTO social_profiles(account_id, public_id, name) VALUES (?, ?, ?)').run(accountId, publicId, `Странник ${publicId.slice(0, 8)}`);
      row = { account_id: accountId, public_id: publicId, name: `Странник ${publicId.slice(0, 8)}`, last_create_at: null, last_message_at: null };
    }
    return { row, eligible: state.level >= unlockLevel };
  }

  private member(accountId: string): MemberRow | undefined {
    return this.db.prepare('SELECT * FROM social_members WHERE account_id = ?').get(accountId) as unknown as MemberRow | undefined;
  }

  private requireMember(accountId: string, leader = false, expectedClanId?: string): MemberRow {
    const row = this.member(accountId);
    if (expectedClanId && row?.clan_id !== expectedClanId) throw new SocialError(409, 'Состав клана изменился. Обновите страницу клана и повторите действие.', 'SOCIAL_CONTEXT_CHANGED');
    if (!row) throw new SocialError(409, 'Сначала вступите в клан.', 'CLAN_REQUIRED');
    if (leader && row.role !== 'leader') throw new SocialError(403, 'Это действие доступно главе клана.', 'FORBIDDEN');
    return row;
  }

  private requireClan(id: string): ClanRow {
    const row = this.db.prepare('SELECT * FROM social_clans WHERE id = ?').get(id) as unknown as ClanRow | undefined;
    if (!row) throw new SocialError(404, 'Клан не найден.', 'NOT_FOUND');
    return row;
  }

  private countMembers(clanId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM social_members WHERE clan_id = ?').get(clanId) as { n: number }).n;
  }

  private participation(accountId: string, week: number): ParticipantRow | undefined {
    return this.db.prepare('SELECT * FROM social_participation WHERE account_id = ? AND week_start = ?').get(accountId, week) as unknown as ParticipantRow | undefined;
  }

  private event(clanId: string, text: string, now: number): void {
    this.db.prepare("INSERT INTO social_messages(id, clan_id, author_id, author_name, text, kind, created_at) VALUES (?, ?, NULL, 'Шовь', ?, 'event', ?)").run(randomUUID(), clanId, text, now);
  }

  private scores(week: number): ScoreRow[] {
    return this.db.prepare(`
      WITH ordered AS (
        SELECT clan_id, role, best_score, ROW_NUMBER() OVER (PARTITION BY clan_id, role ORDER BY best_score DESC, account_id) AS position
        FROM social_participation WHERE week_start = ?
      ) SELECT clan_id, role, SUM(best_score) AS score, COUNT(*) AS contributors FROM ordered WHERE position <= 4 GROUP BY clan_id, role
    `).all(week) as unknown as ScoreRow[];
  }

  private summary(clan: ClanRow, scores: ScoreRow[]): ClanSummary {
    return { id: clan.id, name: clan.name, description: clan.description, language: clan.language, tag: clan.tag,
      recruitment: clan.recruitment, createdAt: clan.created_at, members: this.countMembers(clan.id), capacity,
      weekScore: scores.filter(row => row.clan_id === clan.id).reduce((sum, row) => sum + row.score, 0) };
  }

  private project(accountId: string, now: number, query: string): SocialView {
    const { row: profile, eligible } = this.profile(accountId);
    const week = socialWeekStart(now);
    const scores = this.scores(week);
    const membership = this.member(accountId);
    const personal = this.participation(accountId, week);
    const past = this.db.prepare(`SELECT p.*, c.name AS clan_name FROM social_participation p JOIN social_clans c ON c.id = p.clan_id
      WHERE p.account_id = ? AND p.week_start < ? ORDER BY p.week_start DESC`).all(accountId, week) as unknown as (ParticipantRow & { clan_name: string })[];
    const listings = (this.db.prepare("SELECT * FROM social_clans WHERE archived = 0 AND recruitment = 'open' AND instr(name_key, ?) > 0 ORDER BY created_at DESC, id LIMIT 25").all(nameKey(query)) as unknown as ClanRow[]).map(clan => this.summary(clan, scores));
    const ranked = this.db.prepare(`
      WITH ordered AS (
        SELECT clan_id, role, best_score, ROW_NUMBER() OVER (PARTITION BY clan_id, role ORDER BY best_score DESC, account_id) AS position
        FROM social_participation WHERE week_start = ?
      ), totals AS (SELECT clan_id, SUM(best_score) AS score FROM ordered WHERE position <= 4 GROUP BY clan_id),
      ranks AS (
        SELECT c.*, t.score, RANK() OVER (ORDER BY t.score DESC) AS rank
        FROM social_clans c JOIN totals t ON t.clan_id = c.id
      ) SELECT * FROM ranks ORDER BY score DESC, created_at, id LIMIT 25
    `).all(week) as unknown as (ClanRow & { rank: number; score: number })[];
    let clan: ClanDetail | null = null;
    if (membership) {
      const current = this.requireClan(membership.clan_id);
      const roster = this.db.prepare(`SELECT p.public_id, p.name, m.role, m.joined_at, r.role AS raid_role, r.best_score, r.attempts
        FROM social_members m JOIN social_profiles p ON p.account_id = m.account_id
        LEFT JOIN social_participation r ON r.account_id = m.account_id AND r.clan_id = m.clan_id AND r.week_start = ?
        WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at, p.public_id`).all(week, current.id) as unknown as {
        public_id: string; name: string; role: ClanRole; joined_at: number; raid_role: RaidRole | null; best_score: number | null; attempts: number | null;
      }[];
      const messages = this.db.prepare(`SELECT m.*, EXISTS(SELECT 1 FROM moderation_reports r WHERE r.reporter_id = ? AND r.message_id = m.id) AS reported
        FROM (SELECT * FROM social_messages WHERE clan_id = ? ORDER BY sequence DESC LIMIT 50) m ORDER BY sequence`).all(accountId, current.id) as unknown as {
        id: string; author_id: string | null; author_name: string; text: string; kind: 'message' | 'event'; created_at: number; reported: number;
      }[];
      const achieved = this.db.prepare(`
        WITH ordered AS (
          SELECT week_start, role, best_score, ROW_NUMBER() OVER (PARTITION BY week_start, role ORDER BY best_score DESC, account_id) AS position
          FROM social_participation WHERE clan_id = ? AND week_start < ?
        ) SELECT week_start, SUM(best_score) AS score FROM ordered WHERE position <= 4 GROUP BY week_start ORDER BY week_start DESC
      `).all(current.id, week) as { week_start: number; score: number }[];
      clan = { ...this.summary(current, scores), myRole: membership.role,
        roster: roster.map(row => ({ id: row.public_id, name: row.name, role: row.role, joinedAt: row.joined_at, raidRole: row.raid_role, bestScore: row.best_score ?? 0, attemptsUsed: row.attempts ?? 0 })),
        messages: messages.map(row => ({ id: row.id, authorId: row.author_id, authorName: row.author_name, text: row.text, kind: row.kind, createdAt: row.created_at,
          canDelete: row.kind === 'message' && (row.author_id === profile.public_id || membership.role === 'leader' || membership.role === 'officer'), reported: !!row.reported })),
        raidSeats: (this.db.prepare('SELECT COUNT(*) AS n FROM social_participation WHERE clan_id = ? AND week_start = ?').get(current.id, week) as { n: number }).n,
        roles: roles.map(role => { const score = scores.find(row => row.clan_id === current.id && row.role === role); return { role, score: score?.score ?? 0, contributors: score?.contributors ?? 0 }; }),
        achievements: achieved.flatMap(row => [30_000, 60_000, 90_000, 120_000].filter(threshold => row.score >= threshold).map(threshold => ({ weekStart: row.week_start, threshold }))),
      };
    }
    return { now, eligible, unlockLevel, profile: { id: profile.public_id, name: profile.name, reputation: past.reduce((sum, row) => sum + reputation(row.best_score), 0) },
      week: { id: new Date(week).toISOString().slice(0, 10), start: week, end: week + weekDuration, title: 'Сердце разлома' }, clan, listings,
      leaderboard: ranked.map(row => ({ rank: row.rank, score: row.score, clan: this.summary(row, scores) })),
      personalRaid: personal ? { clanId: personal.clan_id, clanName: this.requireClan(personal.clan_id).name, role: personal.role,
        attemptsUsed: personal.attempts, bestScore: personal.best_score, pendingReputation: reputation(personal.best_score), lastResult: JSON.parse(personal.last_result) as RaidResult } : null,
      history: past.slice(0, 4).map(row => ({ weekStart: row.week_start, clanName: row.clan_name, bestScore: row.best_score, reputation: reputation(row.best_score) })),
    };
  }

  view(accountId: string, now: number, query = ''): SocialView {
    const search = parse(safeText(0, 80), query);
    return this.store.transaction(() => this.project(accountId, now, search));
  }

  command(accountId: string, input: unknown, requestId: string, now: number): SocialView {
    const command = parse(commandSchema, input) as SocialCommand;
    const id = parse(requestIdSchema, requestId);
    const hash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    return this.store.transaction(() => {
      const { row: profile, eligible } = this.profile(accountId);
      const existing = this.db.prepare('SELECT payload_hash FROM social_commands WHERE account_id = ? AND command_id = ?').get(accountId, id) as { payload_hash: string } | undefined;
      if (existing) {
        if (existing.payload_hash !== hash) throw new SocialError(409, 'Этот идентификатор уже использован другой командой.', 'IDEMPOTENCY_CONFLICT');
        return this.project(accountId, now, '');
      }
      if (!eligible && command.type !== 'profile') throw new SocialError(403, 'Кланы и рейд откроются на 10-м уровне.', 'SOCIAL_LOCKED');
      this.execute(accountId, profile, command, now);
      this.db.prepare('INSERT INTO social_commands(account_id, command_id, payload_hash, created_at) VALUES (?, ?, ?, ?)').run(accountId, id, hash, now);
      return this.project(accountId, now, '');
    });
  }

  practice(accountId: string, role: unknown, loadout: unknown, now: number): RaidResult {
    const validRole = parse(roleSchema, role);
    const validLoadout = parse(loadoutSchema, loadout);
    return this.store.transaction(() => {
      if (!this.profile(accountId).eligible) throw new SocialError(403, 'Рейд откроется на 10-м уровне.', 'SOCIAL_LOCKED');
      return this.simulate(validRole, validLoadout, socialWeekStart(now), true);
    });
  }

  private simulate(role: RaidRole, loadout: RaidLoadout, week: number, practice: boolean): RaidResult {
    try { return runRaid(role, loadout, week, practice); }
    catch (error) { throw new SocialError(400, error instanceof Error ? error.message : 'Проверьте сборку рейда.', 'INVALID_LOADOUT'); }
  }

  private execute(accountId: string, profile: ProfileRow, command: SocialCommand, now: number): void {
    if (command.type === 'profile') {
      this.db.prepare('UPDATE social_profiles SET name = ? WHERE account_id = ?').run(command.name, accountId);
      return;
    }
    if (command.type === 'create') {
      if (this.member(accountId)) throw new SocialError(409, 'Вы уже состоите в клане.', 'ALREADY_MEMBER');
      if (profile.last_create_at !== null && now < profile.last_create_at + weekDuration) throw new SocialError(409, 'Новый клан можно создавать раз в семь дней.', 'CREATE_COOLDOWN');
      if (this.db.prepare('SELECT id FROM social_clans WHERE name_key = ?').get(nameKey(command.name))) throw new SocialError(409, 'Такое название клана уже занято.', 'NAME_TAKEN');
      const clanId = randomUUID();
      this.db.prepare("INSERT INTO social_clans(id, name, name_key, description, language, tag, recruitment, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
        .run(clanId, command.name, nameKey(command.name), command.description, command.language, command.tag, now);
      this.db.prepare("INSERT INTO social_members(account_id, clan_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(accountId, clanId, now);
      this.db.prepare('UPDATE social_profiles SET last_create_at = ? WHERE account_id = ?').run(now, accountId);
      this.event(clanId, `${profile.name} основывает клан.`, now);
      return;
    }
    if (command.type === 'join') {
      if (this.member(accountId)) throw new SocialError(409, 'Вы уже состоите в клане.', 'ALREADY_MEMBER');
      const clan = this.requireClan(command.clanId);
      if (clan.archived || clan.recruitment !== 'open') throw new SocialError(409, 'Набор в этот клан закрыт.', 'RECRUITMENT_CLOSED');
      if (this.countMembers(clan.id) >= capacity) throw new SocialError(409, 'В клане уже 20 участников.', 'CLAN_FULL');
      this.db.prepare("INSERT INTO social_members(account_id, clan_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(accountId, clan.id, now);
      this.event(clan.id, `${profile.name} вступает в клан.`, now);
      return;
    }
    if (command.type === 'raid') {
      const week = socialWeekStart(now);
      if (command.weekStart !== week) throw new SocialError(409, 'Началась новая неделя рейда. Обновите страницу и проверьте сборку.', 'SOCIAL_CONTEXT_CHANGED');
      const prior = this.participation(accountId, week);
      const clanId = prior?.clan_id ?? this.requireMember(accountId).clan_id;
      if (command.clanId !== clanId) throw new SocialError(409, 'Клан этой попытки изменился. Обновите страницу рейда.', 'SOCIAL_CONTEXT_CHANGED');
      if (prior && prior.role !== command.role) throw new SocialError(409, 'Роль закреплена до конца недели.', 'RAID_ROLE_LOCKED');
      if (prior && prior.attempts >= 3) throw new SocialError(409, 'Три зачётные попытки этой недели уже использованы.', 'RAID_ATTEMPTS_USED');
      const seats = (this.db.prepare('SELECT COUNT(*) AS n FROM social_participation WHERE clan_id = ? AND week_start = ?').get(clanId, week) as { n: number }).n;
      if (!prior && seats >= capacity) throw new SocialError(409, 'Все 20 мест клана в рейде этой недели заняты.', 'RAID_SEATS_FULL');
      const result = this.simulate(command.role, command.loadout, week, false);
      this.db.prepare('INSERT INTO social_raid_attempts(account_id, week_start, attempt_number, clan_id, role, loadout, result, rules_version, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
        .run(accountId, week, (prior?.attempts ?? 0) + 1, clanId, command.role, JSON.stringify(command.loadout), JSON.stringify(result), now);
      if (prior) {
        this.db.prepare('UPDATE social_participation SET attempts = attempts + 1, best_score = MAX(best_score, ?), last_result = ? WHERE account_id = ? AND week_start = ?')
          .run(result.score, JSON.stringify(result), accountId, week);
      } else {
        this.db.prepare('INSERT INTO social_participation(account_id, week_start, clan_id, role, attempts, best_score, last_result) VALUES (?, ?, ?, ?, 1, ?, ?)')
          .run(accountId, week, clanId, command.role, result.score, JSON.stringify(result));
      }
      this.event(clanId, `${profile.name}: результат рейда ${result.score.toLocaleString('ru-RU')}.`, now);
      return;
    }
    const member = this.requireMember(accountId, ['settings', 'role', 'kick', 'transfer'].includes(command.type), command.clanId);
    if (command.type === 'leave') {
      if (member.role === 'leader' && this.countMembers(member.clan_id) > 1) throw new SocialError(409, 'Перед выходом передайте главенство другому участнику.', 'TRANSFER_REQUIRED');
      this.db.prepare('DELETE FROM social_members WHERE account_id = ?').run(accountId);
      if (member.role === 'leader') this.db.prepare("UPDATE social_clans SET archived = 1, recruitment = 'closed' WHERE id = ?").run(member.clan_id);
      this.event(member.clan_id, `${profile.name} покидает клан.`, now);
      return;
    }
    if (command.type === 'settings') {
      this.db.prepare('UPDATE social_clans SET description = ?, recruitment = ? WHERE id = ?').run(command.description, command.recruitment, member.clan_id);
      return;
    }
    if (command.type === 'message') {
      if (profile.last_message_at !== null && now < profile.last_message_at + 3_000) throw new SocialError(429, 'Между сообщениями нужно подождать три секунды.', 'MESSAGE_COOLDOWN');
      this.db.prepare("INSERT INTO social_messages(id, clan_id, author_id, author_name, text, kind, created_at) VALUES (?, ?, ?, ?, ?, 'message', ?)")
        .run(randomUUID(), member.clan_id, profile.public_id, profile.name, command.text, now);
      this.db.prepare('UPDATE social_profiles SET last_message_at = ? WHERE account_id = ?').run(now, accountId);
      return;
    }
    if (command.type === 'report_message') {
      const message = this.db.prepare(`SELECT m.*, p.account_id FROM social_messages m
        JOIN social_profiles p ON p.public_id = m.author_id WHERE m.id = ? AND m.clan_id = ? AND m.kind = 'message'`)
        .get(command.messageId, member.clan_id) as { account_id: string; author_name: string; text: string } | undefined;
      if (!message) throw new SocialError(404, 'Сообщение не найдено.', 'NOT_FOUND');
      if (message.account_id === accountId) throw new SocialError(400, 'Своё сообщение можно удалить.', 'OWN_MESSAGE');
      if (this.db.prepare('SELECT 1 FROM moderation_reports WHERE reporter_id = ? AND message_id = ?').get(accountId, command.messageId)) return;
      const recent = this.db.prepare('SELECT COUNT(*) AS n FROM moderation_reports WHERE reporter_id = ? AND created_at > ?').get(accountId, now - 3_600_000) as { n: number };
      if (recent.n >= 5) throw new SocialError(429, 'Можно отправить не больше пяти жалоб за час.', 'REPORT_COOLDOWN');
      this.db.prepare(`INSERT INTO moderation_reports(id, reporter_id, author_id, message_id, clan_id, author_name, message_text, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), accountId, message.account_id, command.messageId, member.clan_id, message.author_name, message.text, command.reason, now);
      return;
    }
    if (command.type === 'delete_message') {
      const message = this.db.prepare('SELECT author_id, kind FROM social_messages WHERE id = ? AND clan_id = ?').get(command.messageId, member.clan_id) as { author_id: string | null; kind: string } | undefined;
      if (!message) throw new SocialError(404, 'Сообщение не найдено.', 'NOT_FOUND');
      if (message.kind !== 'message' || (message.author_id !== profile.public_id && !['leader', 'officer'].includes(member.role))) throw new SocialError(403, 'Это сообщение нельзя удалить.', 'FORBIDDEN');
      this.db.prepare('DELETE FROM social_messages WHERE id = ?').run(command.messageId);
      return;
    }
    const target = this.db.prepare(`SELECT m.*, p.name FROM social_members m JOIN social_profiles p ON p.account_id = m.account_id WHERE p.public_id = ? AND m.clan_id = ?`)
      .get(command.memberId, member.clan_id) as unknown as (MemberRow & { name: string }) | undefined;
    if (!target) throw new SocialError(404, 'Участник не найден в вашем клане.', 'NOT_FOUND');
    if (target.role === 'leader') throw new SocialError(409, 'Сначала передайте главенство другому участнику.', 'TRANSFER_REQUIRED');
    if (command.type === 'role') {
      if (command.role === 'officer' && target.role !== 'officer') {
        const count = (this.db.prepare("SELECT COUNT(*) AS n FROM social_members WHERE clan_id = ? AND role = 'officer'").get(member.clan_id) as { n: number }).n;
        if (count >= 2) throw new SocialError(409, 'В клане может быть не более двух офицеров.', 'OFFICERS_FULL');
      }
      this.db.prepare('UPDATE social_members SET role = ? WHERE account_id = ?').run(command.role, target.account_id);
      this.event(member.clan_id, `${target.name}: ${command.role === 'officer' ? 'офицер' : 'участник'} клана.`, now);
    } else if (command.type === 'kick') {
      this.db.prepare('DELETE FROM social_members WHERE account_id = ?').run(target.account_id);
      this.event(member.clan_id, `${target.name} исключён из клана.`, now);
    } else if (command.type === 'transfer') {
      this.db.prepare("UPDATE social_members SET role = 'member' WHERE account_id = ?").run(accountId);
      this.db.prepare("UPDATE social_members SET role = 'leader' WHERE account_id = ?").run(target.account_id);
      this.event(member.clan_id, `${target.name} становится главой клана.`, now);
    }
  }
}
