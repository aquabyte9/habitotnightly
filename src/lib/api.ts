import { supabase } from '@/integrations/supabase/client';

export type HabitUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};

export type HabitProfile = {
  id: string;
  display_name?: string | null;
  xp?: number | null;
  streak_days?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  life_goals?: string[] | null;
  avatar_url?: string | null;
  onboarded?: boolean | null;
  last_active_on?: string | null;
};

export type LeaderboardEntry = {
  display_name?: string | null;
  avatar_url?: string | null;
  xp?: number | null;
  streak_days?: number | null;
};

export type HabitTask = {
  id: string;
  title: string;
  tag: string;
  time: string;
  xp: number;
  done: boolean;
  dueDate?: string;
  created_at?: string;
};

function asError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message ?? fallback);
}

export async function getSession(): Promise<HabitUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user as HabitUser;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw asError(error, 'Unable to sign in. Check your email and password.');
  return { user: data.user as HabitUser };
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
  });
  if (error) throw asError(error, 'Unable to create your account.');
  return { user: (data.user ?? null) as HabitUser | null, needsEmailConfirmation: !data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw asError(error, 'Unable to sign in with Google.');
  // Inside the Lovable preview iframe the top-level redirect is blocked, so open it manually.
  if (data?.url && window.top !== window.self) {
    window.open(data.url, '_blank', 'noopener,noreferrer');
  }
  return data;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw asError(error, 'Unable to send the reset email.');
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw asError(error, 'Unable to update your password.');
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export { todayKey };

/**
 * Streak rules, based on days a task was actually finished:
 * finishing a task today keeps or grows the streak, a whole day with nothing
 * finished drops it back to zero.
 */
export function streakFromProfile(profile: HabitProfile | null): { streak: number; today: string } {
  const today = todayKey();
  const last = profile?.last_active_on ?? null;
  const stored = Math.max(0, Number(profile?.streak_days ?? 0) || 0);
  if (!last) return { streak: 0, today };
  const gap = daysBetween(last, today);
  if (gap <= 1) return { streak: stored, today };
  return { streak: 0, today };
}

/** Backwards-compatible alias used by the app shell. */
export const nextStreak = streakFromProfile;

/** Streak value after finishing a task right now. */
export function streakAfterCompletion(lastDoneOn: string | null, storedStreak: number): { streak: number; today: string } {
  const today = todayKey();
  const stored = Math.max(0, Number(storedStreak) || 0);
  if (!lastDoneOn) return { streak: 1, today };
  const gap = daysBetween(lastDoneOn, today);
  if (gap <= 0) return { streak: Math.max(1, stored), today };
  if (gap === 1) return { streak: Math.max(1, stored) + 1, today };
  return { streak: 1, today };
}

export type HabitEvent = {
  id: string;
  iso: string;
  day: string;
  date: string;
  title: string;
  time: string;
  tone: 'teal' | 'coral' | 'sky';
};

type EventRow = { id: string; iso: string; title: string; time: string | null; tone: string | null };

type EventsTable = {
  select: (columns: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: EventRow[] | null; error: { message?: string } | null }> } };
  insert: (values: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: EventRow | null; error: { message?: string } | null }> } };
  delete: () => { eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }> };
};

function eventsTable(): EventsTable {
  // The generated database types don't list this table yet; the row shape is mapped defensively below.
  const client = supabase as unknown as { from: (table: string) => EventsTable };
  return client.from('events');
}

function toHabitEvent(row: EventRow): HabitEvent {
  const date = new Date(`${row.iso}T00:00:00`);
  const tone = row.tone === 'coral' || row.tone === 'sky' ? row.tone : 'teal';
  return {
    id: row.id,
    iso: row.iso,
    day: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    date: String(date.getDate()),
    title: row.title,
    time: row.time ?? '09:00',
    tone,
  };
}

export async function getEvents(): Promise<HabitEvent[]> {
  const userId = await requireUserId();
  const { data, error } = await eventsTable().select('id, iso, title, time, tone').eq('user_id', userId).order('iso', { ascending: true });
  if (error) throw asError(error, 'Unable to load your calendar.');
  return (data ?? []).map(toHabitEvent);
}

export async function createEvent(input: { iso: string; title: string; time: string; tone?: string }): Promise<HabitEvent> {
  const userId = await requireUserId();
  const { data, error } = await eventsTable()
    .insert({ user_id: userId, iso: input.iso, title: input.title, time: input.time, tone: input.tone ?? 'teal' })
    .select('id, iso, title, time, tone')
    .single();
  if (error || !data) throw asError(error, 'Unable to save that event.');
  return toHabitEvent(data);
}

export async function deleteEvent(id: string) {
  const { error } = await eventsTable().delete().eq('id', id);
  if (error) throw asError(error, 'Unable to delete that event.');
}

export async function saveProgress(input: { xp?: number; streakDays?: number; lastActiveOn?: string }) {
  const userId = await requireUserId();
  const patch: Record<string, unknown> = {};
  if (input.xp !== undefined) patch['xp'] = input.xp;
  if (input.streakDays !== undefined) patch['streak_days'] = input.streakDays;
  if (input.lastActiveOn !== undefined) patch['last_active_on'] = input.lastActiveOn;
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...patch });
  if (error) throw asError(error, 'Unable to save your progress.');
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  return data.user.id;
}

export async function getAccount() {
  const userId = await requireUserId();
  const [profileResult, tasksResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);
  if (profileResult.error) throw asError(profileResult.error, 'Unable to load your profile.');
  if (tasksResult.error) throw asError(tasksResult.error, 'Unable to load your tasks.');

  let profile = profileResult.data as HabitProfile | null;
  if (!profile) {
    const { data: created, error } = await supabase
      .from('profiles')
      .insert({ id: userId })
      .select('*')
      .single();
    if (error) throw asError(error, 'Unable to create your profile.');
    profile = created as HabitProfile;
  }
  return { profile, tasks: (tasksResult.data ?? []) as HabitTask[] };
}

export async function updateProfile(input: {
  displayName?: string;
  heightCm?: number;
  weightKg?: number;
  lifeGoals?: string[];
  avatarUrl?: string;
  onboarded?: boolean;
}) {
  const userId = await requireUserId();
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch['display_name'] = input.displayName;
  if (input.heightCm !== undefined) patch['height_cm'] = input.heightCm;
  if (input.weightKg !== undefined) patch['weight_kg'] = input.weightKg;
  if (input.lifeGoals !== undefined) patch['life_goals'] = input.lifeGoals;
  if (input.avatarUrl !== undefined) patch['avatar_url'] = input.avatarUrl;
  if (input.onboarded !== undefined) patch['onboarded'] = input.onboarded;

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...patch })
    .select('*')
    .single();
  if (error) throw asError(error, 'Unable to save your profile.');
  return data as HabitProfile;
}

export async function getLeaderboard() {
  const { data, error } = await supabase.rpc('get_leaderboard');
  if (error) throw asError(error, 'Unable to load the leaderboard.');
  return (data ?? []) as LeaderboardEntry[];
}

export async function requestAvatarUpload(file: File) {
  const userId = await requireUserId();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw asError(error, 'The profile picture upload did not finish.');
  const { data: signed, error: signError } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !signed?.signedUrl) throw asError(signError, 'Unable to read the uploaded picture.');
  return signed.signedUrl;
}

const XP_RULES: { xp: number; words: string[] }[] = [
  { xp: 30, words: ['marathon', 'gym', 'workout', 'exercise', 'run ', 'running', 'train', 'swim', 'cycle', 'deep work', 'project', 'exam', 'interview'] },
  { xp: 24, words: ['study', 'learn', 'practice', 'code', 'write', 'revise', 'read ', 'reading', 'course', 'homework', 'assignment'] },
  { xp: 18, words: ['clean', 'cook', 'laundry', 'shop', 'plan', 'organise', 'organize', 'budget', 'walk', 'yoga', 'stretch'] },
  { xp: 12, words: ['meditate', 'journal', 'breathe', 'call', 'email', 'message', 'review', 'reflect'] },
  { xp: 6, words: ['water', 'drink', 'vitamin', 'sleep', 'rest', 'nap', 'snack', 'break'] },
];

/** Picks an XP value for a task from what the task says. */
export function autoXpFor(title: string): number {
  const text = ` ${title.toLowerCase().trim()} `;
  let base = 16;
  for (const rule of XP_RULES) {
    if (rule.words.some((word) => text.includes(word))) {
      base = rule.xp;
      break;
    }
  }
  const words = title.trim().split(/\s+/).length;
  if (words >= 8) base += 6;
  else if (words >= 5) base += 3;
  if (/\b(\d+)\s*(hour|hr|hrs|hours)\b/.test(text)) base += 8;
  return Math.max(4, Math.min(60, base));
}

export async function createTask(title: string) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, title, xp: autoXpFor(title) })
    .select('*')
    .single();
  if (error) throw asError(error, 'Unable to add that task.');
  return data as HabitTask;
}

export async function updateTask(id: string, done: boolean) {
  const { data, error } = await supabase.from('tasks').update({ done }).eq('id', id).select('*').single();
  if (error) throw asError(error, 'Unable to update that task.');
  return data as HabitTask;
}

export async function renameTask(id: string, title: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ title, xp: autoXpFor(title) })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw asError(error, 'Unable to rename that task.');
  return data as HabitTask;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw asError(error, 'Unable to delete that task.');
}

/**
 * Weekly challenge claims, stored on the account so a claim made on one device
 * is already claimed everywhere. Returns null when the cloud column is missing,
 * so the caller can fall back to on-device storage.
 */
export async function getChallengeClaims(week: string): Promise<string[] | null> {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('challenge_claims')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    const raw = (data as { challenge_claims?: unknown } | null)?.challenge_claims;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const record = parsed as { week?: string; ids?: string[] } | null;
    if (!record || record.week !== week || !Array.isArray(record.ids)) return [];
    return record.ids.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

export async function saveChallengeClaims(week: string, ids: string[]): Promise<boolean> {
  try {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, challenge_claims: { week, ids } });
    return !error;
  } catch {
    return false;
  }
}
