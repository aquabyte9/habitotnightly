import { createContext, type PointerEvent as ReactPointerEvent, type ReactNode, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  createTask,
  createEvent,
  deleteEvent,
  deleteTask,
  getAccount,
  getEvents,
  streakAfterCompletion,
  getLeaderboard,
  getSession,
  requestAvatarUpload,
  requestPasswordReset,
  setNewPassword,
  signInWithGoogle,
  nextStreak,
  saveProgress,
  signIn,
  signOut,
  signUp,
  updateTask,
  updateProfile,
  getChallengeClaims,
  saveChallengeClaims,
  type HabitProfile,
  type HabitTask,
  type LeaderboardEntry,
  type HabitUser,
} from '@/lib/api';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  GripVertical,
  Leaf,
  LayoutGrid,
  ListChecks,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Trophy,
  User as UserIcon,
  Volume2,
  X,
} from 'lucide-react';

const queryClient = new QueryClient();

type View = 'dashboard' | 'tasks' | 'calendar' | 'focus' | 'leaderboard' | 'profile' | 'rewards';
type HabitEvent = { id: string; iso: string; day: string; date: string; title: string; time: string; tone: 'teal' | 'coral' | 'sky' };


const navItems: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutGrid },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'focus', label: 'Focus', icon: Music2 },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];


/* ---------------- Theme (light/dark + accent) ---------------- */

type ThemeMode = 'dark' | 'light';
type AccentId = 'amber' | 'coral' | 'teal' | 'sky' | 'violet';

const ACCENTS: { id: AccentId; label: string; color: string }[] = [
  { id: 'amber', label: 'Ember', color: '#f3b464' },
  { id: 'coral', label: 'Clay', color: '#df765d' },
  { id: 'teal', label: 'Fern', color: '#69b39a' },
  { id: 'sky', label: 'Tide', color: '#82a8ba' },
];

type ThemeValue = { mode: ThemeMode; accent: AccentId; setMode: (mode: ThemeMode) => void; setAccent: (accent: AccentId) => void };
const ThemeContext = createContext<ThemeValue>({ mode: 'dark', accent: 'amber', setMode: () => undefined, setAccent: () => undefined });
const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [accent, setAccent] = useState<AccentId>('amber');

  useEffect(() => {
    const savedMode = window.localStorage.getItem('habitot-theme');
    const savedAccent = window.localStorage.getItem('habitot-accent');
    if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
    if (savedAccent && ACCENTS.some((item) => item.id === savedAccent)) setAccent(savedAccent as AccentId);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-accent', accent);
    window.localStorage.setItem('habitot-theme', mode);
    window.localStorage.setItem('habitot-accent', accent);
  }, [mode, accent]);

  const value = useMemo(() => ({ mode, accent, setMode, setAccent }), [mode, accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  return <button
    type="button"
    onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
    className={`press grid ${compact ? 'size-9' : 'size-10'} place-items-center rounded-full border border-line bg-[#29241f] text-flame hover:bg-[#332d26]`}
    aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    data-testid="button-theme-toggle"
  >{mode === 'dark' ? <Sun className="size-4 nav-pop" key="sun" /> : <Moon className="size-4 nav-pop" key="moon" />}</button>;
}

function AccentPicker() {
  const { accent, setAccent } = useTheme();
  return <div className="flex items-center gap-2" data-testid="picker-accent">
    {ACCENTS.map((item) => <button
      key={item.id}
      type="button"
      onClick={() => setAccent(item.id)}
      aria-label={`Use the ${item.label} colour`}
      aria-pressed={accent === item.id}
      className={`press size-7 rounded-full border-2 transition-transform ${accent === item.id ? 'scale-110 border-cream' : 'border-transparent'}`}
      style={{ background: item.color }}
      data-testid={`button-accent-${item.id}`}
    />)}
  </div>;
}

/* ---------------- Sticky music player ---------------- */

type Track = { kind: 'audio' | 'embed'; src: string; title: string; url: string };

function parseMedia(raw: string): Track | null {
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.endsWith('youtube.com') || host === 'youtu.be' || host.endsWith('youtube-nocookie.com')) {
      const id = host === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
      const list = parsed.searchParams.get('list');
      if (id) return { kind: 'embed', src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1${list ? `&list=${list}` : ''}`, title: 'YouTube Music', url };
      if (list) return { kind: 'embed', src: `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`, title: 'YouTube playlist', url };
      return null;
    }
    if (host.endsWith('spotify.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => ['track', 'playlist', 'album', 'episode', 'show', 'artist'].includes(part));
      const kindPart = parts[index];
      const idPart = parts[index + 1];
      if (index >= 0 && kindPart && idPart) return { kind: 'embed', src: `https://open.spotify.com/embed/${kindPart}/${idPart}?utm_source=habitot`, title: 'Spotify', url };
      return null;
    }
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '') || parsed.hostname;
    return { kind: 'audio', src: url, title: name, url };
  } catch {
    return null;
  }
}

type PlayerValue = {
  track: Track | null;
  playing: boolean;
  volume: number;
  error: string;
  load: (url: string) => boolean;
  toggle: () => void;
  stop: () => void;
  setVolume: (value: number) => void;
};
const PlayerContext = createContext<PlayerValue>({
  track: null, playing: false, volume: 0.8, error: '',
  load: () => false, toggle: () => undefined, stop: () => undefined, setVolume: () => undefined,
});
const usePlayer = () => useContext(PlayerContext);

function PlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback((url: string) => {
    const parsedTrack = parseMedia(url);
    if (!parsedTrack) {
      setError('That link is not one we can play. Try a YouTube Music, Spotify or direct audio link.');
      return false;
    }
    setError('');
    setTrack(parsedTrack);
    setPlaying(true);
    return true;
  }, []);

  const toggle = useCallback(() => {
    setPlaying((current) => {
      const next = !current;
      const audio = audioRef.current;
      if (audio) {
        if (next) void audio.play().catch(() => setError('Your browser blocked playback. Tap play again.'));
        else audio.pause();
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setTrack(null);
    setPlaying(false);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || track.kind !== 'audio') return;
    audio.volume = volume;
    if (playing) void audio.play().catch(() => setError('Your browser blocked playback. Tap play again.'));
  }, [track, playing, volume]);

  const value = useMemo(() => ({ track, playing, volume, error, load, toggle, stop, setVolume }), [track, playing, volume, error, load, toggle, stop, setVolume]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const startDrag = (event: ReactPointerEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    setPosition({ x: box.left, y: box.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    const box = panel.getBoundingClientRect();
    const x = Math.min(Math.max(8, event.clientX - drag.dx), Math.max(8, window.innerWidth - box.width - 8));
    const y = Math.min(Math.max(8, event.clientY - drag.dy), Math.max(8, window.innerHeight - box.height - 8));
    setPosition({ x, y });
  };

  const endDrag = () => { dragRef.current = null; };

  return <PlayerContext.Provider value={value}>
    {children}
    {track && <div
      ref={panelRef}
      className={position ? 'fade-up fixed z-30 w-[min(430px,calc(100vw-16px))] touch-none' : 'fade-up fixed inset-x-0 bottom-[74px] z-30 px-3 lg:bottom-4 lg:left-auto lg:right-4 lg:w-[430px] lg:px-0'}
      style={position ? { left: position.x, top: position.y } : undefined}
      data-testid="player-sticky"
    >
      <div className="flex items-center gap-2 rounded-[14px] border border-line bg-raised/95 p-2.5 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setPosition(null)}
          aria-label="Move the player. Double click to snap it back."
          className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-[#82796d] hover:text-cream active:cursor-grabbing"
          data-testid="button-player-drag"
        ><GripVertical className="size-4" /></button>
        {track.kind === 'audio' ? <>
          <audio ref={audioRef} src={track.src} onEnded={() => setPlaying(false)} onError={() => setError('That audio link would not load.')} />
          <button type="button" onClick={toggle} className="press grid size-10 shrink-0 place-items-center rounded-full bg-flame text-ink" aria-label={playing ? 'Pause' : 'Play'} data-testid="button-player-toggle">{playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}</button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-cream" data-testid="text-player-title">{track.title}</div>
            <div className="mt-1 flex items-center gap-2"><Volume2 className="size-3.5 text-[#a49b8a]" /><input aria-label="Volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="h-1 w-full accent-[var(--flame)]" data-testid="input-player-volume" /></div>
          </div>
        </> : <div className="min-w-0 flex-1">
          <div className="mb-1 truncate text-[11px] font-semibold text-cream">{track.title}</div>
          <iframe title={track.title} src={track.src} allow="autoplay; encrypted-media; clipboard-write; picture-in-picture" className="h-[80px] w-full rounded-[10px] border-0" data-testid="frame-player-embed" />
        </div>}
        <button type="button" onClick={stop} className="press grid size-8 shrink-0 place-items-center rounded-full border border-line text-[#a49b8a] hover:text-cream" aria-label="Close the player" data-testid="button-player-close"><X className="size-4" /></button>
      </div>
    </div>}
  </PlayerContext.Provider>;
}

function MascotMark({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Habitot mascot" role="img">
      <rect width="48" height="48" rx="14" fill="#f3b464" />
      <path d="M11 19.5 14.5 10l7 4.5c1.8-.6 3.7-.6 5.5 0l7-4.5 3.5 9.5v12.7C37.5 38 32 41 24 41s-13.5-3-13.5-8.8V19.5Z" fill="#28231f" />
      <circle cx="18.7" cy="25.2" r="2.2" fill="#f3b464" />
      <circle cx="29.3" cy="25.2" r="2.2" fill="#f3b464" />
      <path d="M20 31c2.5 2.1 5.5 2.1 8 0" fill="none" stroke="#f3b464" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 28.7v1" stroke="#f3b464" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-wordmark">
      <MascotMark className={compact ? 'size-9' : 'size-10'} />
      <span className="font-display text-[19px] font-semibold tracking-[-0.04em]">Habitot</span>
    </div>
  );
}

const avatarPresets = [
  { id: 'ember', label: 'Ember', symbol: '✦', tone: 'bg-flame text-ink' },
  { id: 'leaf', label: 'Leaf', symbol: '⌁', tone: 'bg-teal text-ink' },
  { id: 'moon', label: 'Moon', symbol: '◒', tone: 'bg-sky text-ink' },
  { id: 'sun', label: 'Sun', symbol: '☼', tone: 'bg-coral text-ink' },
];

function ProfileAvatar({ avatarUrl, name = 'M', size = 'size-12' }: { avatarUrl?: string | null | undefined; name?: string; size?: string }) {
  if (avatarUrl?.startsWith('/api/storage/objects/') || avatarUrl?.startsWith('http')) {
    return <img src={avatarUrl} alt="" className={`${size} rounded-[12px] object-cover`} />;
  }
  const preset = avatarPresets.find((item) => avatarUrl === `builtin:${item.id}`);
  return <div className={`grid ${size} shrink-0 place-items-center rounded-[12px] font-display text-xl font-semibold ${preset?.tone ?? 'bg-coral text-ink'}`}>{preset?.symbol ?? name.slice(0, 1).toUpperCase()}</div>;
}

function PublicIcon({ avatarUrl, size = 'size-11' }: { avatarUrl?: string | null | undefined; size?: string }) {
  const iconClass = 'size-5';
  const isPhoto = typeof avatarUrl === 'string' && /^(https?:|data:|blob:)/.test(avatarUrl);
  if (isPhoto) {
    return <img src={avatarUrl as string} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-[12px] object-cover ring-1 ring-line`} data-testid="img-public-avatar" />;
  }
  const isLeaf = avatarUrl === 'builtin:leaf';
  const isMoon = avatarUrl === 'builtin:moon';
  const isSun = avatarUrl === 'builtin:sun';
  const Icon = isLeaf ? Leaf : isMoon ? Moon : isSun ? Sun : Sparkles;
  const tone = isLeaf ? 'bg-teal/15 text-teal' : isMoon ? 'bg-sky/15 text-sky' : isSun ? 'bg-coral/15 text-coral' : 'bg-flame/15 text-flame';
  return <div className={`grid ${size} shrink-0 place-items-center rounded-[12px] ${tone}`} aria-hidden="true"><Icon className={iconClass} /></div>;
}


function Landing() {
  return (
    <main className="grain landing-glow min-h-[100dvh] overflow-hidden text-cream">
      <div className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[720px] opacity-70" />
      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="press" data-testid="link-landing-brand">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-8 text-[12px] text-[#aaa193] md:flex" aria-label="Main navigation">
          <a href="#rhythm" className="transition-colors hover:text-cream" data-testid="link-landing-rhythm">The rhythm</a>
          <a href="#inside" className="transition-colors hover:text-cream" data-testid="link-landing-inside">Inside Habitot</a>
          <Link href="/login" className="rounded-full border border-line bg-[#2b2621] px-4 py-2 font-medium text-cream transition-colors hover:border-flame hover:text-flame" data-testid="link-landing-sign-in">Sign in</Link>
        </nav>
        <div className="md:hidden">
          <Link href="/login" className="press rounded-full bg-flame px-4 py-2 text-[11px] font-semibold text-ink" data-testid="link-landing-mobile-sign-in">Sign in</Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-[1240px] items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.04fr_.96fr] lg:px-10 lg:pb-32 lg:pt-24">
        <div className="max-w-[700px]">
          <div className="fade-up eyebrow mb-7 flex items-center gap-3 text-flame">
            <span className="h-px w-8 bg-flame" /> A kinder control panel for your day
          </div>
          <h1 className="fade-up stagger-1 font-display text-[clamp(3.8rem,10vw,8.8rem)] font-semibold leading-[.87] tracking-[-.085em]">
            Keep the
            <br />
            <span className="text-flame">streak.</span>
            <br />
            <span className="outline-word">Run</span> your day.
          </h1>
          <p className="fade-up stagger-2 mt-8 max-w-[490px] text-[16px] leading-7 text-[#b2a99a]">
            Habitot keeps the small promises visible: the task that matters, the appointment ahead,
            the focus you are trying to protect. One warm little place for all of it.
          </p>
          <div className="fade-up stagger-3 mt-9 flex flex-wrap items-center gap-3">
            <Link href="/login" className="press inline-flex items-center gap-3 rounded-[11px] bg-flame px-5 py-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_rgba(243,180,100,.14)]" data-testid="link-landing-get-started">
              Step inside Habitot <ArrowRight className="size-4" />
            </Link>
            <a href="#inside" className="press inline-flex items-center gap-2 rounded-[11px] border border-line px-5 py-3.5 text-sm text-[#bdb4a5]" data-testid="link-landing-learn-more">
              See how it works
            </a>
          </div>
          <div className="fade-up stagger-4 mt-12 flex items-center gap-4 text-[11px] text-[#82796d]">
            <div className="flex -space-x-2">
              {['#df765d', '#69b39a', '#82a8ba', '#c99868'].map((color, i) => (
                <span key={color} className="grid size-7 place-items-center rounded-full border-2 border-[#211d19] font-mono text-[9px] text-ink" style={{ background: color }}>
                  {['M', 'R', 'S', 'A'][i]}
                </span>
              ))}
            </div>
            <span>For the 7:14 starts and the 22:03 fresh starts.</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[510px] lg:ml-auto">
          <div className="absolute -right-8 top-16 h-64 w-64 rounded-full bg-flame/10 blur-3xl" />
          <div className="float-slow relative rotate-[2deg] rounded-[24px] border border-line bg-[#2b2621] p-3 shadow-[0_28px_80px_rgba(0,0,0,.3)]">
            <div className="rounded-[18px] border border-[#4a4238] bg-[#211d19] p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <MascotMark className="size-9" />
                  <div>
                    <div className="font-display text-sm font-semibold">Good morning, Mira</div>
                    <div className="eyebrow mt-1 text-[#82796d]">Tuesday · 14 October</div>
                  </div>
                </div>
                <div className="grid size-8 place-items-center rounded-full bg-[#32291f] text-flame"><Bell className="size-4" /></div>
              </div>
              <div className="mt-5 rounded-[15px] bg-[#332b22] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="eyebrow text-[#a49b8a]">Your next right thing</div>
                    <div className="mt-2 font-display text-[22px] font-semibold tracking-[-.04em]">Walk around the block</div>
                  </div>
                  <div className="grid size-9 place-items-center rounded-full border border-flame/40 text-flame"><Target className="size-4" /></div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[#a49b8a]">12:15 · RESET</span>
                  <span className="rounded-full bg-flame px-2.5 py-1 font-mono text-[10px] font-medium text-ink">+20 XP</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric value="03" label="open tasks" color="coral" />
                <MiniMetric value="07" label="day streak" color="flame" />
                <MiniMetric value="02" label="events" color="teal" />
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-[12px] border border-line px-3 py-3">
                <div className="grid size-8 place-items-center rounded-full bg-teal/15 text-teal"><Music2 className="size-3.5" /></div>
                <div className="flex-1">
                  <div className="text-[11px] font-medium">A quiet room, on repeat</div>
                  <div className="mt-0.5 font-mono text-[9px] text-[#82796d]">FOCUS RADIO · 42:18</div>
                </div>
                <span className="flex gap-0.5">
                  {[1, 2, 3, 4].map((n) => <i key={n} className="block w-0.5 rounded-full bg-teal" style={{ height: `${8 + n * 3}px` }} />)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-2 pt-3 text-[10px] text-[#82796d]">
              <span className="font-mono">HABITOT / LOCAL PREVIEW</span><span>01 — 04</span>
            </div>
          </div>
          <div className="absolute -bottom-8 -left-8 hidden -rotate-6 items-center gap-3 rounded-[13px] border border-line bg-[#332d26] px-4 py-3 shadow-lg sm:flex">
            <span className="grid size-8 place-items-center rounded-full bg-coral/15 text-coral"><Flame className="size-4" fill="currentColor" /></span>
            <div><div className="font-display text-sm font-semibold">The streak is yours</div><div className="font-mono text-[9px] text-[#a49b8a]">NO GUILT · JUST RETURN</div></div>
          </div>
        </div>
      </section>

      <div className="relative z-10 overflow-hidden border-y border-line py-4">
        <div className="flex min-w-max items-center gap-12 whitespace-nowrap font-mono text-[10px] tracking-[.22em] text-[#847b70]">
          <span className="pl-6 text-flame">01 / YOUR RHYTHM</span><span>CHECK OFF THE SMALL WINS</span><span>—</span><span className="text-teal">02 / YOUR MOMENTUM</span><span>MAKE A DAY YOU CAN RETURN TO</span><span>—</span><span>03 / YOUR SPACE</span><span>IOS · ANDROID · DESKTOP</span>
        </div>
      </div>

      <section id="inside" className="relative z-10 mx-auto max-w-[1240px] px-6 py-24 lg:px-10 lg:py-36">
        <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <div className="eyebrow text-teal">Not another checklist</div>
            <h2 className="mt-5 max-w-[370px] font-display text-4xl font-semibold leading-[.98] tracking-[-.065em] sm:text-5xl">A day with a little more <span className="text-flame">gravity.</span></h2>
            <p className="mt-6 max-w-[330px] text-sm leading-6 text-[#a49b8a]">The dashboard is deliberately compact. It asks one useful question: what would make today feel like yours?</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureTile index="01" icon={<ListChecks className="size-5" />} title="Tasks that pay attention" copy="Every finished task adds a little XP, not a little pressure. Your streak remembers the return." tone="coral" />
            <FeatureTile index="02" icon={<CalendarDays className="size-5" />} title="A calendar with edges" copy="See what is coming without turning your life into a spreadsheet. Month and week views stay human." tone="teal" />
            <FeatureTile index="03" icon={<Music2 className="size-5" />} title="Focus with atmosphere" copy="Bring your own room tone. A playlist, a stream, or forty quiet minutes with no notification." tone="sky" />
            <FeatureTile index="04" icon={<Sparkles className="size-5" />} title="A companion, not a coach" copy="Habitot is the small friendly witness to your effort. It nudges, celebrates, and knows when to hush." tone="flame" />
          </div>
        </div>
      </section>

      <section id="rhythm" className="relative z-10 border-y border-line bg-[#24201c]">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-6 py-24 lg:grid-cols-[1fr_1fr] lg:px-10 lg:py-32">
          <div className="relative min-h-[330px] overflow-hidden rounded-[22px] border border-line bg-[#1e1b18] p-6">
            <div className="absolute -right-16 -top-16 size-56 rounded-full border border-teal/20" />
            <div className="absolute -right-6 top-0 size-36 rounded-full border border-teal/20" />
            <div className="eyebrow text-[#857d71]">One week, in motion</div>
            <div className="mt-10 flex h-44 items-end justify-between gap-3 px-4">
              {[32, 58, 45, 78, 64, 92, 74].map((height, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
                  <div className={`w-full max-w-[28px] rounded-t-full ${i === 5 ? 'bg-flame' : i === 3 ? 'bg-teal' : 'bg-[#51483e]'}`} style={{ height: `${height}%` }} />
                  <span className="font-mono text-[9px] text-[#82796d]">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                </div>
              ))}
            </div>
            <div className="absolute bottom-6 left-6 flex items-center gap-2 text-[11px] text-[#a49b8a]"><span className="size-2 rounded-full bg-flame" /> your effort has a shape</div>
          </div>
          <div>
            <div className="eyebrow text-flame">Your rhythm, not a streak score</div>
            <h2 className="mt-5 max-w-[480px] font-display text-4xl font-semibold leading-[.98] tracking-[-.065em] sm:text-6xl">Come back to the <span className="text-teal">thread.</span></h2>
            <p className="mt-6 max-w-[430px] text-[15px] leading-7 text-[#aaa193]">Some days are bright, some are barely there. Habitot makes the pattern visible so you can keep choosing the next good thing without starting over.</p>
            <Link href="/login" className="press mt-8 inline-flex items-center gap-2 text-sm font-medium text-flame" data-testid="link-rhythm-sign-in">Sign in to continue <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1240px] px-6 py-24 lg:px-10 lg:py-36">
        <div className="rounded-[24px] border border-line bg-[#332d26] p-8 sm:p-12 lg:p-16">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="eyebrow text-teal">Open loop, closed gently</div>
              <h2 className="mt-5 max-w-[680px] font-display text-4xl font-semibold leading-[.95] tracking-[-.07em] sm:text-6xl">Make room for what <span className="text-flame">matters next.</span></h2>
            </div>
            <Link href="/login" className="press inline-flex w-fit items-center gap-3 rounded-[11px] bg-flame px-5 py-3.5 text-sm font-semibold text-ink" data-testid="link-final-sign-in">Sign in to Habitot <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-14 grid gap-6 border-t border-[#4a4238] pt-6 text-[11px] text-[#a49b8a] sm:grid-cols-3">
            <div><div className="font-mono text-flame">01</div><div className="mt-2">No account required to look around.</div></div>
            <div><div className="font-mono text-teal">02</div><div className="mt-2">Your tasks and streak stay with your account.</div></div>
            <div><div className="font-mono text-sky">03</div><div className="mt-2">Your first check-off is waiting inside.</div></div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-[1240px] flex-col gap-5 border-t border-line px-6 py-8 text-[11px] text-[#82796d] sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <Wordmark compact />
        <span className="font-mono">A small space for a life in progress.</span>
        <Link href="/login" className="text-flame hover:text-cream" data-testid="link-footer-sign-in">Sign in <ArrowRight className="ml-1 inline size-3" /></Link>
      </footer>
    </main>
  );
}

function MiniMetric({ value, label, color }: { value: string; label: string; color: 'coral' | 'flame' | 'teal' }) {
  const text = color === 'coral' ? 'text-coral' : color === 'teal' ? 'text-teal' : 'text-flame';
  return <div className="rounded-[11px] border border-line bg-[#2a241f] p-3"><div className={`font-display text-xl font-semibold ${text}`}>{value}</div><div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[#82796d]">{label}</div></div>;
}

function FeatureTile({ index, icon, title, copy, tone }: { index: string; icon: ReactNode; title: string; copy: string; tone: 'coral' | 'teal' | 'sky' | 'flame' }) {
  const color = tone === 'coral' ? 'text-coral bg-coral/10' : tone === 'teal' ? 'text-teal bg-teal/10' : tone === 'sky' ? 'text-sky bg-sky/10' : 'text-flame bg-flame/10';
  return <article className="group rounded-[16px] border border-line bg-[#29241f] p-5 transition-colors hover:bg-[#332d26]"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-[11px] ${color}`}>{icon}</span><span className="font-mono text-[10px] text-[#71695f]">{index}</span></div><h3 className="mt-7 font-display text-[17px] font-semibold tracking-[-.03em]">{title}</h3><p className="mt-2 text-[13px] leading-5 text-[#9e9587]">{copy}</p></article>;
}

function AppShell({ title, view, onView, children }: { title: string; view: View; onView: (view: View) => void; children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  const navigateHome = () => setLocation('/');
  return (
    <div className="grain app-shell min-h-[100dvh] bg-ink text-cream lg:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-[244px] shrink-0 flex-col border-r border-line bg-[#25211d] px-5 py-6 lg:flex">
        <button type="button" onClick={navigateHome} className="w-fit text-left" data-testid="button-sidebar-brand"><Wordmark /></button>
        <div className="mt-12 px-3 eyebrow text-[#736b60]">Your space</div>
        <nav className="mt-3 flex flex-col gap-1" aria-label="Main navigation">
          {navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => onView(item.id)} desktop />)}
        </nav>
        <div className="mt-auto space-y-2">
          <button type="button" onClick={() => setHelpOpen((open) => !open)} className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm text-[#9f9688] transition-colors hover:bg-[#332d26] hover:text-cream" data-testid="button-help"><CircleHelp className="size-4" /> How Habitot works</button>
          {helpOpen && <div className="rounded-[12px] border border-line bg-[#332d26] p-3 text-[14px] leading-5 text-[#a49b8a]">A private-feeling daily companion. Check things off, notice the rhythm, and return tomorrow.</div>}
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-24 lg:pb-8">
        <header className="mx-auto flex max-w-[1110px] items-center justify-between px-5 pb-2 pt-5 sm:px-8 lg:px-10 lg:pt-8">
          <div className="flex items-center gap-3 lg:hidden"><button type="button" onClick={navigateHome} data-testid="button-mobile-brand"><Wordmark compact /></button></div>
          <div className="hidden lg:block"><div className="eyebrow text-[#796f62]">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1 className="mt-2 font-display text-2xl font-semibold tracking-[-.05em]">{title}</h1></div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch compact />
            <button type="button" onClick={() => setHelpOpen((open) => !open)} className="grid size-9 place-items-center rounded-full border border-line bg-[#29241f] text-[#aaa193] hover:text-cream" aria-label="How Habitot works" data-testid="button-header-help"><CircleHelp className="size-4" /></button>
          </div>
        </header>
        {helpOpen && <div className="mx-auto mt-3 max-w-[1110px] px-5 sm:px-8 lg:px-10"><div className="flex items-start justify-between rounded-[12px] border border-teal/25 bg-teal/10 px-4 py-3 text-[15px] leading-5 text-[#b9cfc2]">Check off a task or switch sections — everything you do here is saved to your account.<button type="button" onClick={() => setHelpOpen(false)} className="ml-4 text-teal" aria-label="Dismiss note" data-testid="button-dismiss-help"><X className="size-4" /></button></div></div>}
        <main className="mx-auto max-w-[1110px] px-5 pt-5 sm:px-8 lg:px-10 lg:pt-7">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-[#25211d]/95 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden" aria-label="Mobile navigation">
        <div className="nav-scroll flex snap-x snap-mandatory gap-1 overflow-x-auto px-3">{navItems.map((item) => <div key={item.id} className="w-[22%] min-w-[76px] shrink-0 snap-start"><NavButton item={item} active={view === item.id} onClick={() => onView(item.id)} /></div>)}</div>
      </nav>
    </div>
  );
}

function NavButton({ item, active, onClick, desktop = false }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void; desktop?: boolean }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} className={`press flex ${desktop ? 'w-full flex-row gap-3 px-3 py-2.5 text-sm' : 'w-full flex-col justify-center gap-1 px-2 py-1.5 text-[12px]'} items-center rounded-[11px] font-medium transition-colors ${active ? 'bg-flame/12 text-flame' : 'text-[#91887b] hover:bg-[#332d26] hover:text-cream'}`} aria-current={active ? 'page' : undefined} data-testid={`button-nav-${item.id}`}><Icon className={`size-4 ${active ? 'nav-pop' : ''}`} /><span className="whitespace-nowrap">{item.label}</span></button>;
}

const XP_PER_LEVEL = 100;

// XP needed to go from `level` to `level + 1`. After every 10 levels the
// requirement rises by 100 more: levels 1-10 cost 100 each, 11-20 cost 200,
// 21-30 cost 300, and so on.
function levelXpCost(level: number) {
  return XP_PER_LEVEL * (Math.floor((level - 1) / 10) + 1);
}

// Total XP needed to reach `level` (level 1 starts at 0 XP).
function xpToReachLevel(level: number) {
  const blocks = Math.floor((level - 1) / 10);
  const rest = (level - 1) % 10;
  return 500 * blocks * (blocks + 1) + rest * XP_PER_LEVEL * (blocks + 1);
}

// Inverse of xpToReachLevel: the level a given amount of XP puts you at.
function levelFromXp(xp: number) {
  const safe = Math.max(0, Math.floor(xp));
  let blocks = Math.max(0, Math.floor((-1 + Math.sqrt(1 + safe / 125)) / 2));
  while (500 * (blocks + 1) * (blocks + 2) <= safe) blocks += 1;
  while (blocks > 0 && 500 * blocks * (blocks + 1) > safe) blocks -= 1;
  const base = xpToReachLevel(10 * blocks + 1);
  const cost = XP_PER_LEVEL * (blocks + 1);
  const rest = Math.min(9, Math.floor((safe - base) / cost));
  return 10 * blocks + rest + 1;
}

function ProfileHeader({ streak, xp, name, avatarUrl }: { streak: number; xp: number; name: string; avatarUrl?: string | null | undefined }) {
  const safeXp = Math.max(0, xp);
  const level = levelFromXp(safeXp);
  const into = safeXp - xpToReachLevel(level);
  const goal = levelXpCost(level);
  const pct = Math.max(0, Math.min(100, (into / goal) * 100));
  return <section className="relative overflow-hidden rounded-[16px] border border-line bg-surface p-4 sm:p-5" data-testid="card-profile-header">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-flame/10 via-teal/5 to-transparent" />
    <div className="relative flex flex-wrap items-start gap-4">
      <div className="relative shrink-0">
        <div className="absolute -inset-1 rounded-[16px] bg-gradient-to-br from-flame to-teal opacity-60 blur-[1px]" />
        <ProfileAvatar avatarUrl={avatarUrl} name={name} size="size-14" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-display text-base font-semibold" data-testid="text-profile-name">{name}</div>
          <span className="rounded-full bg-flame/10 px-2 py-0.5 font-mono text-[12px] font-medium text-flame">Lvl {level}</span>
        </div>
        <div className="eyebrow mt-1 text-muted-foreground">finding momentum</div>
      </div>
      <div className="streak-pill flex items-center gap-2 rounded-full border border-flame/25 bg-flame/10 px-3 py-2" key={streak}>
        <Flame className="size-4 text-flame" fill="currentColor" />
        <div className="flex flex-col leading-none">
          <span className="font-display text-lg font-semibold">{streak}</span>
          <span className="font-mono text-[8px] uppercase text-flame/80">day streak</span>
        </div>
      </div>
    </div>
    <div className="relative mt-6">
      <div className="mb-2 flex items-end justify-between">
        <span className="eyebrow text-muted-foreground">XP to level {level + 1}</span>
        <span className="font-mono text-[14px] text-muted-foreground" data-testid="text-xp-progress">{Math.max(0, into)} / {goal}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-raised">
        <div className="xp-bar-glow h-full rounded-full bg-gradient-to-r from-flame to-coral transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} data-testid="bar-xp" />
      </div>
    </div>
  </section>;
}

function DashboardLoading() {
  return <div className="space-y-4" data-testid="status-dashboard-loading"><div className="skeleton h-28 rounded-[16px]" /><div className="grid grid-cols-3 gap-3"><div className="skeleton h-20 rounded-[14px]" /><div className="skeleton h-20 rounded-[14px]" /><div className="skeleton h-20 rounded-[14px]" /></div><div className="grid gap-3 lg:grid-cols-2"><div className="skeleton h-64 rounded-[16px]" /><div className="skeleton h-64 rounded-[16px]" /></div></div>;
}

function GoogleGlyph() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2H12Z" />
    <path fill="#34A853" d="M6.6 14.3 5.9 15l-2.6 2A9 9 0 0 0 12 21c2.4 0 4.5-.8 6-2.2l-3.2-2.5c-.8.6-1.9.9-2.8.9-2.4 0-4.4-1.6-5.1-3.8Z" />
    <path fill="#FBBC05" d="M3.3 7A9 9 0 0 0 3 12c0 1.5.4 2.9 1 4.1l3.3-2.6a5.4 5.4 0 0 1 0-3.4L3.3 7Z" />
    <path fill="#4285F4" d="M12 6.6c1.4 0 2.6.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.3 7l3.3 2.6C7.3 8 9.4 6.6 12 6.6Z" />
  </svg>;
}

function AuthPanel({
  user,
  open,
  onOpenChange,
  onAuthed,
  onLogout,
}: {
  user: HabitUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthed: (user: HabitUser) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (user) {
    const displayName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'friend';
    return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-teal/20 bg-teal/10 px-4 py-3 text-[15px] text-[#b9cfc2]" data-testid="status-authenticated">
      <span>Signed in as <strong className="font-medium text-cream">{displayName}</strong>. Your tasks follow you here.</span>
      <button type="button" onClick={() => void onLogout()} className="font-mono text-[12px] uppercase tracking-wider text-teal hover:text-cream" data-testid="button-logout">Sign out</button>
    </div>;
  }

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const result = await signUp(email, password, name);
        if (result.needsEmailConfirmation) {
          setMessage('Check your email to confirm your account, then sign in here.');
          setMode('login');
        } else if (result.user) {
          await onAuthed(result.user);
          setMessage('');
        }
      } else {
        const result = await signIn(email, password);
        await onAuthed(result.user);
        setMessage('');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue right now.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMessage('');
    try {
      await signInWithGoogle();
      // The browser leaves for Google; the session arrives on return.
      return;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in with Google.');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setMessage('Type your email address first, then tap this again.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setMessage('Password reset link sent. Check your email.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send the reset email.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="mb-4 rounded-[14px] border border-flame/25 bg-flame/10 p-4" data-testid="panel-auth">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="eyebrow text-flame">{open ? (mode === 'login' ? 'Welcome back' : 'Make it yours') : 'Welcome'}</div><p className="mt-1 text-[15px] text-[#b9aa96]">{open ? 'Save your tasks and return to them on any device.' : 'Sign in to keep your tasks, streak, and progress.'}</p></div>
      <button type="button" onClick={() => { onOpenChange(!open); setMessage(''); }} className="rounded-[9px] border border-flame/35 px-3 py-2 text-xs font-semibold text-flame hover:bg-flame/10" data-testid="button-auth-toggle">{open ? 'Close' : 'Sign in or sign up'}</button>
    </div>
    {open && <div className="mt-4 border-t border-flame/15 pt-4">
      <div className="mb-3 flex gap-4 font-mono text-[12px] uppercase tracking-wider"><button type="button" onClick={() => { setMode('login'); setMessage(''); }} className={mode === 'login' ? 'text-flame' : 'text-[#8d8171]'}>Sign in</button><button type="button" onClick={() => { setMode('signup'); setMessage(''); }} className={mode === 'signup' ? 'text-flame' : 'text-[#8d8171]'}>Create account</button></div>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {mode === 'signup' && <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" className="rounded-[9px] border border-line bg-[#2a241f] px-3 py-2 text-sm text-cream outline-none focus:border-flame" data-testid="input-auth-name" />}
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" required autoComplete="email" className="rounded-[9px] border border-line bg-[#2a241f] px-3 py-2 text-sm text-cream outline-none focus:border-flame" data-testid="input-auth-email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (8+ characters)" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="rounded-[9px] border border-line bg-[#2a241f] px-3 py-2 text-sm text-cream outline-none focus:border-flame" data-testid="input-auth-password" />
        <button type="submit" disabled={busy} className="press rounded-[9px] bg-flame px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60" data-testid="button-auth-submit">{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <div className="mt-4 flex items-center gap-3 text-[12px] uppercase tracking-wider text-[#8d8171]"><span className="h-px flex-1 bg-flame/20" />or<span className="h-px flex-1 bg-flame/20" /></div>
      <button type="button" disabled={busy} onClick={() => void google()} className="press mt-4 flex w-full items-center justify-center gap-3 rounded-[10px] border border-line bg-[#2a241f] px-4 py-2.5 text-sm font-semibold text-cream hover:border-flame disabled:opacity-60" data-testid="button-google-signin">
        <GoogleGlyph /> Continue with Google
      </button>
      {mode === 'login' && <button type="button" onClick={() => void forgot()} className="mt-3 font-mono text-[12px] uppercase tracking-wider text-[#a49b8a] hover:text-flame" data-testid="button-forgot-password">Forgot your password?</button>}
      {message && <p className="mt-3 text-xs text-[#d8a76f]" role="status">{message}</p>}
    </div>}
  </div>;
}

function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [avatar, setAvatar] = useState('builtin:ember');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getSession().then(async (session) => {
      if (!session) {
        setLocation('/login');
        return;
      }
      const account = await getAccount();
      const profile = account.profile;
      setName(profile.display_name ?? session.user_metadata?.full_name ?? '');
      setHeight(profile.height_cm ? String(profile.height_cm) : '');
      setWeight(profile.weight_kg ? String(profile.weight_kg) : '');
      setGoals(profile.life_goals ?? []);
      setAvatar(profile.avatar_url ?? 'builtin:ember');
    }).catch(() => setLocation('/login'));
  }, [setLocation]);

  const finish = async () => {
    setBusy(true);
    setMessage('');
    try {
      await updateProfile({
        displayName: name.trim() || 'Friend',
        heightCm: Number(height),
        weightKg: Number(weight),
        lifeGoals: goals,
        avatarUrl: avatar,
        onboarded: true,
      });
      setLocation('/app');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === 1 && !name.trim()) {
      setMessage('Choose the name you want Habitot to use.');
      return;
    }
    if (step < 4) {
      setMessage('');
      setStep((current) => current + 1);
    } else {
      void finish();
    }
  };

  return <main className="grain landing-glow min-h-[100dvh] px-5 py-8 text-cream sm:px-8">
    <div className="mx-auto max-w-[680px]">
      <Link href="/"><Wordmark /></Link>
      <div className="mt-12 rounded-[20px] border border-line bg-surface p-5 sm:p-8">
        <div className="eyebrow text-teal">A few gentle questions · {step} / 4</div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#433b32]"><div className="h-full rounded-full bg-teal transition-all duration-500" style={{ width: `${step * 25}%` }} /></div>
        {step === 1 && <div className="mt-8"><h1 className="font-display text-3xl font-semibold tracking-[-.06em]">What should we call you?</h1><p className="mt-2 text-sm text-[#9f9688]">This stays in your private profile.</p><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="mt-7 w-full rounded-[10px] border border-line bg-[#2a241f] px-4 py-3 text-cream outline-none focus:border-teal" data-testid="input-onboarding-name" /></div>}
        {step === 2 && <div className="mt-8"><h1 className="font-display text-3xl font-semibold tracking-[-.06em]">A little body context</h1><p className="mt-2 text-sm text-[#9f9688]">Optional in spirit, private by design, and only used for your space.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><label className="text-xs text-[#a49b8a]">Height (cm)<input value={height} onChange={(event) => setHeight(event.target.value)} type="number" min="40" max="260" placeholder="170" className="mt-2 w-full rounded-[10px] border border-line bg-[#2a241f] px-4 py-3 text-cream outline-none focus:border-teal" /></label><label className="text-xs text-[#a49b8a]">Weight (kg)<input value={weight} onChange={(event) => setWeight(event.target.value)} type="number" min="20" max="400" placeholder="65" className="mt-2 w-full rounded-[10px] border border-line bg-[#2a241f] px-4 py-3 text-cream outline-none focus:border-teal" /></label></div></div>}
        {step === 3 && <div className="mt-8"><h1 className="font-display text-3xl font-semibold tracking-[-.06em]">What are you making room for?</h1><p className="mt-2 text-sm text-[#9f9688]">Choose what feels useful today. You can change this later.</p><div className="mt-7 grid gap-2 sm:grid-cols-2">{['More energy', 'A calmer mind', 'Creative work', 'Better sleep', 'Movement', 'Showing up for myself'].map((goal) => <button key={goal} type="button" onClick={() => setGoals((current) => current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal])} className={`rounded-[10px] border px-4 py-3 text-left text-sm transition-colors ${goals.includes(goal) ? 'border-teal bg-teal/15 text-cream' : 'border-line bg-[#2a241f] text-[#a49b8a] hover:border-teal/50'}`}>{goal}</button>)}</div></div>}
        {step === 4 && <div className="mt-8"><h1 className="font-display text-3xl font-semibold tracking-[-.06em]">Choose your little mark</h1><p className="mt-2 text-sm text-[#9f9688]">Pick an icon or upload your own private profile picture.</p><div className="mt-7 flex flex-wrap gap-3">{avatarPresets.map((item) => <button key={item.id} type="button" onClick={() => setAvatar(`builtin:${item.id}`)} className={`rounded-[14px] border p-2 ${avatar === `builtin:${item.id}` ? 'border-flame' : 'border-line'}`} aria-label={item.label}><ProfileAvatar avatarUrl={`builtin:${item.id}`} size="size-14" /></button>)}<label className="grid size-[76px] cursor-pointer place-items-center rounded-[14px] border border-dashed border-line text-center text-[12px] text-[#a49b8a] hover:border-flame"><span>Upload<br />photo</span><input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const objectPath = await requestAvatarUpload(file); setAvatar(objectPath); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to upload that image.'); } finally { setBusy(false); } }} /></label></div><div className="mt-6 flex items-center gap-3"><ProfileAvatar avatarUrl={avatar} name={name} size="size-14" /><span className="text-sm text-[#b9aa96]">This is how you’ll appear in your private space.</span></div></div>}
        {message && <p className="mt-5 text-xs text-coral" role="alert">{message}</p>}
        <div className="mt-8 flex justify-between"><button type="button" onClick={() => step > 1 && setStep((current) => current - 1)} className="text-sm text-[#9f9688] hover:text-cream">{step > 1 ? 'Back' : 'Sign out'}</button><button type="button" onClick={next} disabled={busy} className="press rounded-[10px] bg-flame px-5 py-3 text-sm font-semibold text-ink disabled:opacity-60">{busy ? 'Saving…' : step === 4 ? 'Enter Habitot' : 'Continue'}</button></div>
      </div>
    </div>
  </main>;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getSession().then(async (session) => {
      if (!session) {
        setChecking(false);
        return;
      }
      const account = await getAccount();
      setLocation(account.profile?.onboarded ? '/app' : '/onboarding');
    }).catch(() => setChecking(false));
  }, [setLocation]);

  const onAuthed = async (nextUser: HabitUser) => {
    const account = await getAccount();
    if (account.profile?.onboarded) {
      setLocation('/app');
    } else {
      setLocation('/onboarding');
    }
  };

  if (checking) {
    return <BootScreen label="Finding your space" />;
  }

  return <main className="grain landing-glow flex min-h-[100dvh] items-center justify-center px-5 py-10 text-cream">
    <div className="w-full max-w-[520px]">
      <Link href="/" className="mb-8 inline-flex"><Wordmark /></Link>
      <div className="rounded-[20px] border border-line bg-surface p-5 sm:p-7">
        <div className="eyebrow text-flame">A quiet return</div>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-.06em]">Your space is waiting.</h1>
        <p className="mt-2 text-sm leading-6 text-[#9f9688]">Sign in to keep your tasks, streak, and small wins close.</p>
        <div className="mt-6"><AuthPanel user={null} open onOpenChange={() => undefined} onAuthed={onAuthed} onLogout={async () => undefined} /></div>
        {message && <p className="mt-3 text-xs text-coral">{message}</p>}
      </div>
      <p className="mt-5 text-center text-xs text-[#82796d]">New here? Create an account above and we’ll ask a few gentle questions before you begin.</p>
    </div>
  </main>;
}

function BootScreen({ label = 'Making room for your day' }: { label?: string }) {
  return <main className="grain landing-glow flex min-h-[100dvh] items-center justify-center px-6 text-cream" aria-live="polite">
    <div className="w-full max-w-[300px] text-center">
      <MascotMark className="mx-auto size-16 float-slow" />
      <div className="mt-6 font-display text-xl font-semibold tracking-[-.04em]">Habitot</div>
      <p className="mt-2 font-mono text-[12px] uppercase tracking-[.18em] text-[#82796d]">{label}</p>
      <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-[#433b32]"><div className="boot-progress h-full rounded-full bg-flame" /></div>
    </div>
  </main>;
}

function LevelUpCelebration({ level, onDismiss }: { level: number; onDismiss: () => void }) {
  const pieces = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const colors = ['var(--flame)', 'var(--teal)', '#df765d', '#f3d9a4'];
    return {
      id: index,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.9 + Math.random() * 1.1,
      drift: `${Math.round((Math.random() - 0.5) * 220)}px`,
      spin: `${Math.round(360 + Math.random() * 720)}deg`,
      size: 6 + Math.round(Math.random() * 7),
      round: Math.random() > 0.6,
      color: colors[index % colors.length] as string,
    };
  }), [level]);

  useEffect(() => {
    const onKey = (nativeEvent: KeyboardEvent) => { if (nativeEvent.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return <div
    role="dialog"
    aria-modal="true"
    aria-label={`Level ${level} reached`}
    onClick={onDismiss}
    className="levelup-overlay fixed inset-0 z-[80] grid cursor-pointer place-items-center bg-ink/85 px-6 backdrop-blur-sm"
    data-testid="overlay-level-up"
  >
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => <span
        key={piece.id}
        className="confetti-piece"
        style={{
          left: `${piece.left}%`,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.8,
          background: piece.color,
          borderRadius: piece.round ? '9999px' : '2px',
          animationDelay: `${piece.delay}s`,
          animationDuration: `${piece.duration}s`,
          ['--drift' as string]: piece.drift,
          ['--spin' as string]: piece.spin,
        }}
      />)}
    </div>

    <div className="relative w-full max-w-[340px] text-center text-cream">
      <div className="levelup-mascot mx-auto w-fit"><MascotMark className="size-20" /></div>
      <div className="levelup-rise eyebrow mt-6 text-flame" style={{ animationDelay: '.1s' }}>Level up</div>
      <div className="levelup-number mt-2 font-display text-[92px] font-semibold leading-none tracking-[-.07em] text-flame drop-shadow-[0_0_28px_rgba(243,180,100,.45)]" data-testid="text-level-up-number">{level}</div>
      <p className="levelup-rise mt-4 text-sm leading-6 text-[#d8cdbc]" style={{ animationDelay: '.22s' }}>That is a whole new level of you. Keep the streak going.</p>
      <div className="levelup-rise mt-6 font-mono text-[12px] uppercase tracking-[.18em] text-[#a49b8a]" style={{ animationDelay: '.3s' }}>Tap anywhere to continue</div>
    </div>
  </div>;
}

function DashboardPreview() {
  const [view, setView] = useState<View>('dashboard');
  const [tasks, setTasks] = useState<HabitTask[]>([]);
  const [events, setEvents] = useState<HabitEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(1);
  const [profile, setProfile] = useState<HabitProfile | null>(null);
  const [user, setUser] = useState<HabitUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState('');
  const [celebrateLevel, setCelebrateLevel] = useState<number | null>(null);
  const [lastDoneOn, setLastDoneOn] = useState<string | null>(null);
  const levelRef = useRef(1);
  const [, setLocation] = useLocation();

  const commitXp = useCallback((value: number) => {
    const nextXp = Math.max(0, value);
    const nextLevel = levelFromXp(nextXp);
    if (nextLevel > levelRef.current) setCelebrateLevel(nextLevel);
    levelRef.current = nextLevel;
    setXp(nextXp);
    return nextXp;
  }, []);

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    setLeaderboardError('');
    try {
      setLeaderboard(await getLeaderboard());
    } catch (loadError) {
      setLeaderboardError(loadError instanceof Error ? loadError.message : 'Unable to load the leaderboard.');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const hydrate = async (nextUser: HabitUser) => {
    setLoading(true);
    setError('');
    try {
      const account = await getAccount();
      setUser(nextUser);
      setTasks(account.tasks);
      setProfile(account.profile);
      const currentXp = Math.max(0, account.profile?.xp ?? 0);
      levelRef.current = levelFromXp(currentXp);
      setXp(currentXp);
      // The streak only counts days a task was actually finished: a full day
      // with nothing finished drops it back to zero.
      const { streak: currentStreak } = nextStreak(account.profile);
      setStreak(currentStreak);
      setLastDoneOn(account.profile?.last_active_on ?? null);
      if (currentStreak !== (account.profile?.streak_days ?? 0)) {
        void saveProgress({ streakDays: currentStreak }).catch(() => undefined);
      }
      try {
        setEvents(await getEvents());
      } catch {
        setEvents([]);
      }
      setAuthOpen(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your saved space.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getSession();
        if (!active) return;
        if (session) await hydrate(session);
        else setLocation('/login');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to check your session.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [setLocation]);

  useEffect(() => {
    if (user && view === 'leaderboard') void loadLeaderboard();
  }, [user, view]);

  const done = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);
  const toggleTask = async (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const next = !task.done;
    const nextXp = Math.max(0, xp + (next ? task.xp : -task.xp));
    setTasks((current) => current.map((item) => item.id === id ? { ...item, done: next } : item));
    commitXp(nextXp);
    // Finishing something today keeps the streak alive.
    const progress: { xp: number; streakDays?: number; lastActiveOn?: string } = { xp: nextXp };
    if (next) {
      const { streak: nextStreakValue, today } = streakAfterCompletion(lastDoneOn, streak);
      setStreak(nextStreakValue);
      setLastDoneOn(today);
      progress.streakDays = nextStreakValue;
      progress.lastActiveOn = today;
    }
    if (user) {
      try {
        await updateTask(id, next);
        await saveProgress(progress);
      } catch (updateError) {
        setTasks((current) => current.map((item) => item.id === id ? { ...item, done: task.done } : item));
        setXp(xp);
        levelRef.current = levelFromXp(Math.max(0, xp));
        setError(updateError instanceof Error ? updateError.message : 'Unable to save that change.');
      }
    }
  };
  const awardXp = useCallback((amount: number) => {
    setXp((current) => {
      const next = Math.max(0, current + amount);
      const nextLevel = levelFromXp(next);
      if (nextLevel > levelRef.current) setCelebrateLevel(nextLevel);
      levelRef.current = nextLevel;
      // Earning XP counts as an active day, so the streak stays alive.
      if (amount > 0) {
        const { streak: nextStreakValue, today } = streakAfterCompletion(lastDoneOn, streak);
        setStreak(nextStreakValue);
        setLastDoneOn(today);
        void saveProgress({ xp: next, streakDays: nextStreakValue, lastActiveOn: today }).catch(() => undefined);
      } else {
        void saveProgress({ xp: next }).catch(() => undefined);
      }
      return next;
    });
  }, [lastDoneOn, streak]);
  const addTask = async (title: string) => {
    if (!title.trim()) return;
    try {
      const task = user
        ? await createTask(title.trim())
        : { id: `task-${Date.now()}`, title: title.trim(), tag: 'New', time: 'ANYTIME', xp: 16, done: false, created_at: new Date().toISOString() };
      setTasks((current) => [...current, task]);
      setError('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create that task.');
    }
    setShowComposer(false);
  };
  const removeTask = async (id: string) => {
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== id));
    if (!user) return;
    try {
      await deleteTask(id);
    } catch (deleteError) {
      setTasks(previous);
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete that task.');
    }
  };
  const addEvent = async (input: { iso: string; title: string; time: string }) => {
    const local: HabitEvent = {
      id: `event-${Date.now()}`,
      iso: input.iso,
      day: new Date(`${input.iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      date: String(new Date(`${input.iso}T00:00:00`).getDate()),
      title: input.title,
      time: input.time,
      tone: 'teal',
    };
    if (!user) { setEvents((current) => [...current, local]); return; }
    try {
      const saved = await createEvent(input);
      setEvents((current) => [...current, saved]);
      setError('');
    } catch (createError) {
      setEvents((current) => [...current, local]);
      setError(createError instanceof Error ? createError.message : 'Unable to save that event.');
    }
  };
  const removeEvent = async (id: string) => {
    const previous = events;
    setEvents((current) => current.filter((item) => item.id !== id));
    if (!user) return;
    try {
      await deleteEvent(id);
    } catch (deleteError) {
      setEvents(previous);
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete that event.');
    }
  };
  const logout = async () => {
    await signOut();
    setUser(null);
    setProfile(null);
    setTasks([]);
    setEvents([]);
    setXp(0);
    setStreak(1);
    setLastDoneOn(null);
    setCelebrateLevel(null);
    levelRef.current = 1;
    setLeaderboard([]);
    setLeaderboardError('');
    setView('dashboard');
    setLocation('/login');
  };
  const title = view === 'rewards' ? 'Rewards' : navItems.find((item) => item.id === view)?.label ?? 'Overview';
  const displayName = profile?.display_name?.trim()
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Friend';

  return <AppShell title={title} view={view} onView={setView}>
    <AuthPanel user={user} open={authOpen} onOpenChange={setAuthOpen} onAuthed={hydrate} onLogout={logout} />
    {error && <div className="mb-4 rounded-[12px] border border-coral/30 bg-coral/10 px-4 py-3 text-xs text-[#f2b3a8]" role="alert">{error}</div>}
    {loading ? <DashboardLoading /> : view === 'dashboard' ? <Overview tasks={tasks} events={events} done={done} xp={xp} streak={streak} name={displayName} avatarUrl={profile?.avatar_url} onToggle={(id) => void toggleTask(id)} onDelete={(id) => void removeTask(id)} onView={setView} /> : view === 'tasks' ? <TasksView tasks={tasks} onToggle={(id) => void toggleTask(id)} onDelete={(id) => void removeTask(id)} onAdd={(value) => void addTask(value)} showComposer={showComposer} setShowComposer={setShowComposer} /> : view === 'calendar' ? <CalendarView events={events} onAdd={(input) => void addEvent(input)} onDelete={(id) => void removeEvent(id)} /> : view === 'leaderboard' ? <LeaderboardView entries={leaderboard} loading={leaderboardLoading} error={leaderboardError} onRetry={() => void loadLeaderboard()} /> : view === 'rewards' ? <RewardsView xp={xp} streak={streak} tasksTotal={tasks.length} tasksDone={done} seed={user?.id ?? profile?.id ?? 'habitot'} onBack={() => setView('profile')} onAward={awardXp} /> : view === 'profile' ? <ProfileView name={displayName} email={user?.email ?? ''} avatarUrl={profile?.avatar_url} xp={xp} streak={streak} tasksTotal={tasks.length} tasksDone={done} onLogout={() => void logout()} onOpenRewards={() => setView('rewards')} /> : <FocusView onSessionComplete={awardXp} />}
    {celebrateLevel !== null && <LevelUpCelebration level={celebrateLevel} onDismiss={() => setCelebrateLevel(null)} />}
  </AppShell>;
}

function LeaderboardView({ entries, loading, error, onRetry }: { entries: LeaderboardEntry[]; loading: boolean; error: string; onRetry: () => void }) {
  return <div className="max-w-[820px] space-y-5" data-testid="view-leaderboard">
    <div>
      <div className="eyebrow text-flame">A shared rhythm</div>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">See the good work around you.</h2>
      <p className="mt-2 max-w-[560px] text-sm leading-6 text-[#9f9688]">A gentle look at momentum from people who have chosen to share it. Only public profile details appear here.</p>
    </div>
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-coral/30 bg-coral/10 px-4 py-3 text-xs text-[#f2b3a8]" role="alert" data-testid="status-leaderboard-error"><span>{error}</span><button type="button" onClick={onRetry} className="font-mono text-[12px] uppercase tracking-wider text-coral hover:text-cream" data-testid="button-retry-leaderboard">Try again</button></div>}
    {loading ? <LeaderboardLoading /> : entries.length === 0 ? <LeaderboardEmpty /> : <section className="overflow-hidden rounded-[16px] border border-line bg-surface" aria-label="Habitot leaderboard" data-testid="list-leaderboard">{entries.map((entry, index) => <LeaderboardRow key={index} entry={entry} rank={index + 1} />)}</section>}
  </div>;
}

function LeaderboardLoading() {
  return <section className="space-y-2" aria-live="polite" aria-busy="true" data-testid="status-leaderboard-loading">
    {Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-[76px] rounded-[14px]" data-testid={`status-leaderboard-skeleton-${index}`} />)}
  </section>;
}

function LeaderboardEmpty() {
  return <section className="rounded-[16px] border border-dashed border-line bg-surface px-5 py-12 text-center" data-testid="status-leaderboard-empty">
    <div className="mx-auto grid size-12 place-items-center rounded-full bg-flame/10 text-flame"><Trophy className="size-5" /></div>
    <h3 className="mt-4 font-display text-lg font-semibold">Nothing to compare yet</h3>
    <p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-[#82796d]">When more people choose to share their momentum, their public progress will appear here.</p>
  </section>;
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const displayName = entry.display_name?.trim() || 'Habitot friend';
  const xp = Math.max(0, Math.floor(Number(entry.xp ?? 0)));
  const streak = Math.max(0, Math.floor(Number(entry.streak_days ?? 0)));
  return <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-5" data-testid={`row-leaderboard-${rank}`}>
    <span className="w-6 shrink-0 text-center font-mono text-[14px] text-[#82796d]" aria-label={`Rank ${rank}`}>{String(rank).padStart(2, '0')}</span>
    <PublicIcon avatarUrl={entry.avatar_url} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium" data-testid={`text-leaderboard-name-${rank}`}>{displayName}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#82796d]">public progress</div>
    </div>
    <div className="text-right">
      <div className="font-display text-sm font-semibold text-flame" data-testid={`text-leaderboard-xp-${rank}`}>{xp} XP</div>
      <div className="mt-1 flex items-center justify-end gap-1 font-mono text-[9px] uppercase tracking-wider text-[#a49b8a]" data-testid={`text-leaderboard-streak-${rank}`}><Flame className="size-3 text-coral" fill="currentColor" /> {streak} day streak</div>
    </div>
  </div>;
}

/** Local YYYY-MM-DD key for a date. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function taskDayKey(task: HabitTask) {
  const raw = task.dueDate ?? task.created_at;
  const date = raw ? new Date(raw) : new Date();
  return dayKey(Number.isNaN(date.getTime()) ? new Date() : date);
}

function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Newest task first, using when it was created. */
function sortNewestFirst(tasks: HabitTask[]) {
  return [...tasks].sort((a, b) => {
    const at = new Date(a.created_at ?? a.dueDate ?? 0).getTime();
    const bt = new Date(b.created_at ?? b.dueDate ?? 0).getTime();
    if (bt !== at) return bt - at;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Groups tasks by their day, newest day first. */
function groupTasksByDay(tasks: HabitTask[]) {
  const groups = new Map<string, HabitTask[]>();
  for (const task of tasks) {
    const key = taskDayKey(task);
    const bucket = groups.get(key);
    if (bucket) bucket.push(task);
    else groups.set(key, [task]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, items]) => ({ key, label: dayLabel(key), tasks: sortNewestFirst(items) }));
}

function Overview({ tasks, events, xp, streak, name, avatarUrl, onToggle, onDelete, onView }: { tasks: HabitTask[]; events: HabitEvent[]; done: number; xp: number; streak: number; name: string; avatarUrl?: string | null | undefined; onToggle: (id: string) => void; onDelete: (id: string) => void; onView: (view: View) => void }) {
  const today = dayKey(new Date());
  const todaysTasks = sortNewestFirst(tasks.filter((task) => taskDayKey(task) === today));
  const todaysDone = todaysTasks.filter((task) => task.done).length;
  return <div className="space-y-4">
    <div className="lg:hidden"><div className="eyebrow text-[#796f62]">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1 className="mt-2 font-display text-2xl font-semibold tracking-[-.05em]">A good day to begin.</h1></div>
    <ProfileHeader streak={streak} xp={xp} name={name} avatarUrl={avatarUrl} />
    <div className="grid grid-cols-3 gap-3">
      <Stat value={String(tasks.filter((task) => !task.done).length).padStart(2, '0')} label="open tasks" color="coral" />
      <Stat value={String(events.length).padStart(2, '0')} label="up next" color="teal" />
      <Stat value={String(todaysDone).padStart(2, '0')} label="done today" color="sky" />
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.16fr_.84fr]">
      <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5" data-testid="card-today-tasks">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-coral" /><h2 className="font-display text-sm font-semibold">Today's tasks</h2></div><button type="button" onClick={() => onView('tasks')} className="flex items-center gap-1 font-mono text-[12px] uppercase tracking-wider text-[#91887b] hover:text-flame" data-testid="button-view-all-tasks">View all <ChevronRight className="size-3" /></button></div>
        <div className="space-y-1">{todaysTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}</div>
        {todaysTasks.length === 0 && <EmptyState icon={<ListChecks className="size-5" />} title="A clear slate" copy="Add one small thing to begin." action="Add a task" onClick={() => onView('tasks')} />}
        <div className="mt-4 border-t border-line pt-3 text-right font-mono text-[12px] text-[#82796d]">{todaysDone} of {todaysTasks.length} complete today · {todaysTasks.reduce((sum, task) => sum + (task.done ? task.xp : 0), 0)} XP earned</div>
      </section>
      <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5" data-testid="card-upcoming-events">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-teal" /><h2 className="font-display text-sm font-semibold">Coming up</h2></div><button type="button" onClick={() => onView('calendar')} className="flex items-center gap-1 font-mono text-[12px] uppercase tracking-wider text-[#91887b] hover:text-flame" data-testid="button-view-calendar">Calendar <ChevronRight className="size-3" /></button></div>
        {events.length ? events.slice(0, 3).map((event, index) => <EventRow key={event.id} event={event} last={index === Math.min(events.length, 3) - 1} />) : <EmptyState icon={<CalendarDays className="size-5" />} title="Nothing on the horizon" copy="A little spacious. Add an event when you're ready." action="Open calendar" onClick={() => onView('calendar')} />}
      </section>
    </div>
    <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-[16px] border border-line bg-[#332d26] p-5" data-testid="card-companion"><div className="flex items-start justify-between"><div><div className="eyebrow text-flame">A note from your companion</div><p className="mt-4 max-w-[260px] font-display text-xl font-medium leading-tight">You don't need a perfect day. Just a next thing.</p></div><MascotMark className="size-14 float-slow" /></div><button type="button" onClick={() => onView('focus')} className="mt-6 flex items-center gap-2 font-mono text-[12px] uppercase tracking-wider text-flame" data-testid="button-start-focus">Make some room <ArrowRight className="size-3.5" /></button></section>
      <RhythmCard tasks={tasks} />
    </div>
  </div>;
}

function Stat({ value, label, color }: { value: string; label: string; color: 'coral' | 'teal' | 'sky' }) {
  const className = color === 'coral' ? 'bg-coral' : color === 'teal' ? 'bg-teal' : 'bg-sky';
  return <div className="rounded-[14px] border border-line bg-surface p-3 sm:p-4"><div className="font-display text-2xl font-semibold tracking-[-.06em]">{value}</div><div className="mt-1.5 font-mono text-[9px] uppercase tracking-[.12em] text-[#82796d]">{label}</div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#433b32]"><div className={`h-full w-2/3 rounded-full ${className}`} /></div></div>;
}

function TaskRow({ task, onToggle, onDelete }: { task: HabitTask; onToggle: (id: string) => void; onDelete?: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="group flex items-center gap-3 rounded-[10px] px-1 py-2.5 transition-colors hover:bg-[#332d26]">
    <button type="button" aria-pressed={task.done} aria-label={`${task.done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} onClick={() => onToggle(task.id)} className={`grid size-5 shrink-0 place-items-center rounded-[5px] border-2 transition-colors ${task.done ? 'border-coral bg-coral text-ink' : 'border-[#675b4c] hover:border-coral'}`} data-testid={`button-toggle-task-${task.id}`}>{task.done && <Check className="check-pop size-3.5" strokeWidth={3} />}</button>
    <span className={`min-w-0 flex-1 text-sm ${task.done ? 'strike-line' : ''}`}>{task.title}</span>
    <span className="hidden font-mono text-[9px] uppercase text-[#82796d] sm:inline">{task.time}</span>
    <span className="font-mono text-[12px] text-flame">+{task.xp}</span>
    {onDelete && (confirming
      ? <span className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => { setConfirming(false); onDelete(task.id); }} className="press rounded-[8px] bg-coral px-2 py-1 text-[12px] font-semibold text-ink" data-testid={`button-confirm-delete-task-${task.id}`}>Delete</button>
        <button type="button" onClick={() => setConfirming(false)} className="press rounded-[8px] border border-line px-2 py-1 text-[12px] text-[#a49b8a]" data-testid={`button-cancel-delete-task-${task.id}`}>Keep</button>
      </span>
      : <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete task: ${task.title}`} className="press grid size-7 shrink-0 place-items-center rounded-[8px] text-[#82796d] opacity-70 transition-colors hover:bg-coral/10 hover:text-coral focus-visible:opacity-100 group-hover:opacity-100" data-testid={`button-delete-task-${task.id}`}><Trash2 className="size-3.5" /></button>)}
  </div>;
}

function EventRow({ event, last }: { event: HabitEvent; last: boolean }) {
  const tint = event.tone === 'teal' ? 'bg-teal/10 text-teal' : event.tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-sky/10 text-sky';
  return <div className={`flex items-center gap-3 py-2.5 ${!last ? 'border-b border-line' : ''}`}><div className={`w-10 shrink-0 rounded-[8px] py-1.5 text-center ${tint}`}><div className="font-mono text-[8px]">{event.day}</div><div className="font-display text-lg font-semibold leading-none">{event.date}</div></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{event.title}</div><div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-[#82796d]"><Clock3 className="size-3" /> {event.time}</div></div></div>;
}

function RhythmCard({ tasks }: { tasks: HabitTask[] }) {
  const today = dayKey(new Date());
  const days = [...Array(7)].map((_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000);
    const key = dayKey(date);
    const dayTasks = tasks.filter((task) => taskDayKey(task) === key);
    const earned = dayTasks.reduce((sum, task) => sum + (task.done ? task.xp : 0), 0);
    return {
      key,
      earned,
      completed: dayTasks.filter((task) => task.done).length,
      letter: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
    };
  });
  const peak = Math.max(...days.map((day) => day.earned), 1);
  const weekTotal = days.reduce((sum, day) => sum + day.earned, 0);
  const activeDays = days.filter((day) => day.completed > 0).length;
  const headline = weekTotal === 0 ? 'Your rhythm starts here' : activeDays >= 5 ? 'Your rhythm is strong' : 'Your rhythm is warming up';

  return <section className="rounded-[16px] border border-line bg-surface p-5" data-testid="card-weekly-rhythm">
    <div className="flex items-center justify-between">
      <div><div className="eyebrow text-[#82796d]">Last 7 days</div><h2 className="mt-2 font-display text-sm font-semibold">{headline}</h2></div>
      <span className="rounded-full bg-teal/10 px-2.5 py-1 font-mono text-[9px] text-teal" data-testid="text-rhythm-total">{weekTotal} XP this week</span>
    </div>
    <div className="mt-6 flex h-24 items-end gap-2">{days.map((day) => {
      const height = day.earned === 0 ? 4 : Math.max(10, Math.round((day.earned / peak) * 100));
      return <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${day.completed} done · ${day.earned} XP`}>
        <div className={`w-full rounded-t-[5px] transition-[height] duration-700 ease-out ${day.key === today ? 'bg-flame' : day.earned > 0 ? 'bg-teal' : 'bg-[#51483e]'}`} style={{ height: `${height}%` }} data-testid={`bar-rhythm-${day.key}`} />
        <span className="font-mono text-[8px] text-[#71695f]">{day.letter}</span>
      </div>;
    })}</div>
    <div className="mt-3 font-mono text-[9px] uppercase tracking-wider text-[#82796d]">{activeDays} of 7 days active</div>
  </section>;
}

function EmptyState({ icon, title, copy, action, onClick }: { icon: ReactNode; title: string; copy: string; action: string; onClick: () => void }) {
  return <div className="rounded-[12px] border border-dashed border-line px-4 py-7 text-center"><div className="mx-auto grid size-10 place-items-center rounded-full bg-[#332d26] text-[#91887b]">{icon}</div><div className="mt-3 text-sm font-medium">{title}</div><p className="mt-1 text-xs text-[#82796d]">{copy}</p><button type="button" onClick={onClick} className="mt-4 text-xs font-medium text-flame hover:text-cream" data-testid={`button-empty-${action.toLowerCase().replaceAll(' ', '-')}`}>{action} <ArrowRight className="ml-1 inline size-3" /></button></div>;
}

function TasksView({ tasks, onToggle, onDelete, onAdd, showComposer, setShowComposer }: { tasks: HabitTask[]; onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: (title: string) => void; showComposer: boolean; setShowComposer: (show: boolean) => void }) {
  const [title, setTitle] = useState('');
  const submit = () => { onAdd(title); setTitle(''); };
  return <div className="max-w-[760px] space-y-4" data-testid="view-tasks"><div className="flex items-end justify-between"><div><div className="eyebrow text-coral">Keep it light</div><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">The task shelf</h2><p className="mt-2 text-sm text-[#9f9688]">Small enough to start. Specific enough to finish.</p></div><button type="button" onClick={() => setShowComposer(!showComposer)} className="press grid size-10 place-items-center rounded-[11px] bg-flame text-ink" aria-label="Add a task" data-testid="button-add-task"><Plus className="size-5" /></button></div>
    {showComposer && <div className="flex gap-2 rounded-[14px] border border-flame/30 bg-flame/10 p-3"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="What would feel good to finish?" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-cream outline-none placeholder:text-[#8f8678]" data-testid="input-new-task" /><button type="button" onClick={submit} className="rounded-[9px] bg-flame px-3 py-2 text-xs font-semibold text-ink" data-testid="button-save-task">Add task</button><button type="button" onClick={() => setShowComposer(false)} className="grid size-8 place-items-center text-[#a49b8a]" aria-label="Cancel adding task" data-testid="button-cancel-task"><X className="size-4" /></button></div>}
    {tasks.length === 0
      ? <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5"><EmptyState icon={<ListChecks className="size-5" />} title="Your shelf is empty" copy="Add the first small promise." action="Add a task" onClick={() => setShowComposer(true)} /></section>
      : groupTasksByDay(tasks).slice(0, 3).map((group) => <section key={group.key} className="rounded-[16px] border border-line bg-surface p-4 sm:p-5" data-testid={`card-task-day-${group.key}`}>
        <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
          <h3 className="font-display text-sm font-semibold" data-testid={`text-task-day-${group.key}`}>{group.label}</h3>
          <span className="font-mono text-[12px] uppercase tracking-wider text-[#82796d]">{group.tasks.filter((task) => task.done).length}/{group.tasks.length} done · {group.tasks.reduce((sum, task) => sum + (task.done ? task.xp : 0), 0)} XP</span>
        </div>
        <div className="divide-y divide-[#494138]">{group.tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}</div>
      </section>)}
  </div>;
}

function CalendarView({ events, onAdd, onDelete }: { events: HabitEvent[]; onAdd: (input: { iso: string; title: string; time: string }) => void; onDelete: (id: string) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const countFor = (key: string) => events.filter((event) => event.iso === key).length;
  const selectedDate = new Date(`${selected}T00:00:00`);
  const dayEvents = events.filter((event) => event.iso === selected).sort((a, b) => a.time.localeCompare(b.time));

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ iso: selected, title: title.trim(), time });
    setTitle('');
    setAdding(false);
  };

  return <div className="space-y-4" data-testid="view-calendar">
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="eyebrow text-teal">Make space for it</div>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <p className="mt-2 text-sm text-[#9f9688]">Pick any day, then add what belongs there.</p>
      </div>
      <button type="button" onClick={() => setAdding(!adding)} className="press inline-flex shrink-0 items-center gap-2 rounded-[11px] bg-teal px-3.5 py-2.5 text-xs font-semibold text-ink" data-testid="button-add-event"><Plus className="size-4" /> Add event</button>
    </div>

    {adding && <div className="flex max-w-[640px] flex-wrap items-center gap-2 rounded-[14px] border border-teal/30 bg-teal/10 p-3">
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder={`Name this moment · ${selectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[#8f9688]" data-testid="input-new-event" />
      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-[9px] border border-line bg-surface px-2 py-1.5 font-mono text-xs outline-none" data-testid="input-event-time" />
      <button type="button" onClick={submit} className="rounded-[9px] bg-teal px-3 py-2 text-xs font-semibold text-ink" data-testid="button-save-event">Add</button>
    </div>}

    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="press grid size-8 place-items-center rounded-[9px] border border-line text-[#9f9688] hover:text-cream" aria-label="Previous month" data-testid="button-prev-month"><ChevronRight className="size-4 rotate-180" /></button>
          <div className="font-mono text-[12px] uppercase tracking-wider text-[#9f9688]">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="press grid size-8 place-items-center rounded-[9px] border border-line text-[#9f9688] hover:text-cream" aria-label="Next month" data-testid="button-next-month"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] uppercase text-[#82796d]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => <div key={label} className="py-2">{label[0]}</div>)}
          {cells.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;
            const key = dayKey(date);
            const isToday = key === dayKey(today);
            const isSelected = key === selected;
            const count = countFor(key);
            return <button key={key} type="button" onClick={() => setSelected(key)} className={`press relative grid aspect-square place-items-center rounded-[8px] text-xs transition ${isSelected ? 'bg-flame font-semibold text-ink' : isToday ? 'border border-flame/60 text-cream' : 'text-[#82796d] hover:bg-[#332d26]'}`} data-testid={`button-day-${key}`}>
              {date.getDate()}
              {count > 0 && <span className={`absolute bottom-1 size-1 rounded-full ${isSelected ? 'bg-ink' : 'bg-teal'}`} />}
            </button>;
          })}
        </div>
      </section>
      <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><span className="size-2 rounded-full bg-teal" /><h3 className="font-display text-sm font-semibold">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>
        {dayEvents.length ? dayEvents.map((event, index) => <div key={event.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><EventRow event={event} last={index === dayEvents.length - 1} /></div>
          <button type="button" onClick={() => onDelete(event.id)} className="press grid size-8 shrink-0 place-items-center rounded-[9px] text-[#82796d] hover:text-coral" aria-label="Delete event" data-testid={`button-delete-event-${event.id}`}><Trash2 className="size-4" /></button>
        </div>) : <EmptyState icon={<CalendarDays className="size-5" />} title="Nothing on this day" copy="Your next plan can live here." action="Add an event" onClick={() => setAdding(true)} />}
      </section>
    </div>
  </div>;
}

function FocusView({ onSessionComplete }: { onSessionComplete: (xp: number) => void }) {
  const SESSION = 25 * 60;
  const SESSION_XP = 25;
  const STORE_KEY = 'habitot-focus';
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(SESSION);
  const [sessions, setSessions] = useState(0);
  const [earned, setEarned] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [link, setLink] = useState('');
  const { load, error, track, playing, toggle, stop } = usePlayer();

  // Restore a session that was left running while the app was closed or in another tab.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { endsAt?: number | null; paused?: number; sessions?: number; earned?: number };
      setSessions(Math.max(0, Number(saved.sessions ?? 0)));
      setEarned(Math.max(0, Number(saved.earned ?? 0)));
      if (saved.endsAt && saved.endsAt > Date.now()) setEndsAt(saved.endsAt);
      else setPaused(Math.max(0, Math.min(SESSION, Number(saved.paused ?? SESSION))) || SESSION);
    } catch {
      /* ignore a corrupt saved session */
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ endsAt, paused, sessions, earned }));
  }, [endsAt, paused, sessions, earned]);

  // A wall-clock end time keeps counting down while the tab is hidden or the app is minimised.
  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setInterval(() => setTick(Date.now()), 500);
    const resync = () => setTick(Date.now());
    window.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, [endsAt]);

  const seconds = endsAt === null ? paused : Math.max(0, Math.ceil((endsAt - tick) / 1000));
  const running = endsAt !== null;

  useEffect(() => {
    if (endsAt === null || seconds > 0) return;
    setEndsAt(null);
    setPaused(SESSION);
    setSessions((count) => count + 1);
    setEarned((total) => total + SESSION_XP);
    onSessionComplete(SESSION_XP);
  }, [endsAt, seconds, onSessionComplete]);

  const startOrPause = () => {
    if (endsAt === null) {
      const base = seconds > 0 ? seconds : SESSION;
      setTick(Date.now());
      setEndsAt(Date.now() + base * 1000);
    } else {
      setPaused(seconds);
      setEndsAt(null);
    }
  };

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remaining = String(seconds % 60).padStart(2, '0');

  return <div className="max-w-[780px] space-y-4 pb-28 lg:pb-4" data-testid="view-focus">
    <div><div className="eyebrow text-sky">Protect the next hour</div><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Focus room</h2><p className="mt-2 text-sm text-[#9f9688]">No optimization required. Just a little less noise.</p></div>
    <section className="relative overflow-hidden rounded-[20px] border border-line bg-[#252d2b] p-8 sm:p-12">
      <div className="absolute -right-16 -top-20 size-64 rounded-full border border-teal/20" />
      <div className="absolute -bottom-32 -left-10 size-72 rounded-full border border-sky/10" />
      <div className="relative text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-[17px] bg-teal/15 text-teal"><Music2 className="size-7" /></div>
        <div className="eyebrow mt-7 text-[#9dbbb0]">Quiet room · 25 minute session</div>
        <div className="mt-5 font-mono text-[clamp(4rem,13vw,7rem)] leading-none tracking-[-.08em] text-cream" data-testid="text-focus-timer">{minutes}:{remaining}</div>
        <div className="mt-4 text-sm text-[#a9bdb3]">A good place to put one thing down.{running ? ' It keeps running if you leave or minimise the app.' : ''}</div>
        <button type="button" onClick={startOrPause} className="press mt-8 rounded-[11px] bg-flame px-6 py-3 text-sm font-semibold text-ink" data-testid="button-toggle-focus">{running ? 'Pause the room' : 'Start a focus session'}</button>
        <button type="button" onClick={() => { setEndsAt(null); setPaused(SESSION); }} className="ml-3 rounded-[11px] border border-[#536760] px-4 py-3 text-sm text-[#b5c8be] hover:bg-[#33433e]" data-testid="button-reset-focus">Reset</button>
      </div>
    </section>

    <section className="rounded-[16px] border border-line bg-surface p-4 sm:p-5" data-testid="card-music">
      <div className="flex items-center gap-2"><Music2 className="size-4 text-teal" /><h3 className="font-display text-sm font-semibold">Bring your own sound</h3></div>
      <p className="mt-2 text-[15px] leading-5 text-[#9f9688]">Paste a YouTube Music, Spotify, or direct audio link. It keeps playing while you move between tabs.</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (load(link)) setLink(''); }}>
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://open.spotify.com/… or https://music.youtube.com/…" className="min-w-0 flex-1 rounded-[10px] border border-line bg-[#2a241f] px-3 py-2.5 text-sm text-cream outline-none focus:border-flame" data-testid="input-music-link" />
        <button type="submit" className="press rounded-[10px] bg-teal px-4 py-2.5 text-xs font-semibold text-ink" data-testid="button-music-play">Play it</button>
      </form>
      {error && <p className="mt-2 text-xs text-coral" role="alert">{error}</p>}
      {track && <div className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-[#a49b8a]">
        <span className="truncate">Now playing · {track.title}</span>
        {track.kind === 'audio' && <button type="button" onClick={toggle} className="press rounded-[9px] border border-line px-3 py-1.5 text-[14px] text-cream" data-testid="button-music-toggle">{playing ? 'Pause' : 'Play'}</button>}
        <button type="button" onClick={stop} className="press rounded-[9px] border border-line px-3 py-1.5 text-[14px] text-cream" data-testid="button-music-stop">Stop</button>
      </div>}
    </section>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[14px] border border-line bg-surface p-4"><div className="font-mono text-[9px] uppercase text-[#82796d]">Sound</div><div className="mt-2 flex items-center gap-2 truncate text-sm"><Music2 className="size-4 text-teal" /> {track ? track.title : 'Nothing playing yet'}</div></div>
      <div className="rounded-[14px] border border-line bg-surface p-4"><div className="font-mono text-[9px] uppercase text-[#82796d]">Sessions</div><div className="mt-2 text-sm" data-testid="text-focus-sessions">{String(sessions).padStart(2, '0')} this week</div></div>
      <div className="rounded-[14px] border border-line bg-surface p-4"><div className="font-mono text-[9px] uppercase text-[#82796d]">Earned</div><div className="mt-2 text-sm text-flame" data-testid="text-focus-earned">+{earned} XP</div></div>
    </div>
  </div>;
}

// ============================ Rewards ============================

type EggStage = { min: number; name: string; note: string };
const EGG_STAGES: EggStage[] = [
  { min: 1, name: 'A quiet egg', note: 'A dragon egg. It is listening to your days.' },
  { min: 2, name: 'First crack', note: 'A hairline split. Your effort is being felt.' },
  { min: 4, name: 'Almost out', note: 'The shell is giving way. Not long now.' },
  { min: 5, name: 'Hatchling', note: 'A tiny dragon, wobbly wings and all. It is yours.' },
  { min: 8, name: 'Young dragon', note: 'Bigger wings, real horns, and rather pleased with you.' },
  { min: 12, name: 'Full-grown dragon', note: 'A dragon shaped entirely by your streaks.' },
];
function eggStageIndex(level: number) {
  let index = 0;
  EGG_STAGES.forEach((stage, i) => { if (level >= stage.min) index = i; });
  return index;
}

/** Every account gets its own dragon colour, picked from their id. */
function dragonHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360000;
  return hash % 360;
}

function CompanionEgg({ level, seed = 'habitot' }: { level: number; seed?: string }) {
  const index = eggStageIndex(level);
  const hatched = index >= 3;
  const hue = dragonHue(seed);
  const light = `hsl(${hue} 78% 66%)`;
  const dark = `hsl(${(hue + 22) % 360} 62% 40%)`;
  const belly = `hsl(${(hue + 40) % 360} 70% 82%)`;
  const gradientId = `dragon-${hue}`;
  const scale = index >= 5 ? 'size-[128px]' : index >= 4 ? 'size-[116px]' : 'size-[96px]';

  if (!hatched) {
    return <div className="relative grid size-[132px] place-items-center" data-testid="egg-visual" data-stage={index}>
      <div className="absolute inset-0 rounded-full blur-xl" style={{ background: `hsl(${hue} 70% 55% / 0.18)` }} />
      <svg viewBox="0 0 100 130" className="relative size-[112px] float-slow" role="img" aria-label="Dragon egg">
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={light} /><stop offset="100%" stopColor={dark} /></linearGradient></defs>
        <path d="M50 4C24 32 10 62 10 84a40 40 0 0 0 80 0c0-22-14-52-40-80Z" fill={`url(#${gradientId})`} stroke="rgba(0,0,0,.25)" strokeWidth="2" />
        <path d="M32 40c8 5 6 12 14 14" stroke="rgba(255,255,255,.35)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <g opacity=".45" fill="rgba(255,255,255,.5)">
          <ellipse cx="38" cy="72" rx="5" ry="3.4" /><ellipse cx="58" cy="86" rx="5" ry="3.4" /><ellipse cx="46" cy="100" rx="5" ry="3.4" />
        </g>
        {index >= 1 && <path d="M30 70l12-8 -4 14 14-6" stroke="rgba(30,18,10,.75)" strokeWidth="3" fill="none" strokeLinejoin="round" />}
        {index >= 2 && <path d="M66 52l-10 10 10 6-8 10 10 8" stroke="rgba(30,18,10,.75)" strokeWidth="3" fill="none" strokeLinejoin="round" />}
        {index >= 2 && <path d="M40 98l10-8 6 10" stroke="rgba(30,18,10,.6)" strokeWidth="3" fill="none" strokeLinejoin="round" />}
      </svg>
    </div>;
  }

  const adult = index >= 5;
  const young = index >= 4;
  return <div className="relative grid size-[132px] place-items-center" data-testid="egg-visual" data-stage={index}>
    <div className="absolute inset-0 rounded-full blur-xl" style={{ background: `hsl(${hue} 70% 55% / 0.2)` }} />
    <svg viewBox="0 0 120 120" className={`relative ${scale} float-slow`} role="img" aria-label="Your dragon">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={light} /><stop offset="100%" stopColor={dark} /></linearGradient></defs>
      {/* wings grow with the stage */}
      <path
        d={young ? 'M60 60C40 34 20 30 12 40c-6 8 4 26 22 34 10 4 20 2 26-6Z' : 'M60 62C48 48 36 46 30 52c-4 6 2 16 12 20 7 3 14 2 18-4Z'}
        fill={dark} opacity=".85" stroke="rgba(0,0,0,.2)" strokeWidth="2"
      />
      {adult && <path d="M60 60C80 34 100 30 108 40c6 8-4 26-22 34-10 4-20 2-26-6Z" fill={dark} opacity=".6" stroke="rgba(0,0,0,.2)" strokeWidth="2" />}
      {/* tail */}
      <path d={adult ? 'M62 88c18 12 32 6 38-8' : 'M62 86c12 8 22 4 26-4'} stroke={dark} strokeWidth={adult ? 9 : 7} fill="none" strokeLinecap="round" />
      {/* body */}
      <ellipse cx="58" cy="78" rx={adult ? 26 : young ? 23 : 20} ry={adult ? 22 : young ? 19 : 17} fill={`url(#${gradientId})`} stroke="rgba(0,0,0,.22)" strokeWidth="2" />
      <ellipse cx="56" cy="84" rx={adult ? 15 : 12} ry={adult ? 11 : 9} fill={belly} opacity=".65" />
      {/* head */}
      <ellipse cx="54" cy="46" rx={adult ? 22 : young ? 19 : 17} ry={adult ? 19 : young ? 17 : 15} fill={`url(#${gradientId})`} stroke="rgba(0,0,0,.22)" strokeWidth="2" />
      <ellipse cx="46" cy="54" rx={adult ? 12 : 10} ry={adult ? 8 : 7} fill={belly} opacity=".6" />
      {/* snout + nostril */}
      <ellipse cx="38" cy="52" rx="8" ry="6" fill={light} stroke="rgba(0,0,0,.18)" strokeWidth="1.5" />
      <circle cx="33" cy="51" r="1.6" fill="rgba(0,0,0,.45)" />
      {/* horns */}
      <path d={young ? 'M58 30c2-10 8-14 14-15-4 6-4 12-6 17Z' : 'M58 32c1-6 5-9 10-10-3 4-3 8-4 11Z'} fill={dark} />
      {adult && <path d="M48 30c0-9 4-14 9-16-3 6-3 11-4 16Z" fill={dark} />}
      {/* back spines */}
      <path d={adult ? 'M64 62l7-9 2 11 8-7 1 12' : 'M64 64l6-7 2 9 6-5 1 9'} fill={dark} opacity=".9" />
      {/* eye */}
      <ellipse cx="50" cy="43" rx={adult ? 4.2 : 3.6} ry={adult ? 5 : 4.2} fill="#1c1410" />
      <circle cx="51.4" cy="41.4" r="1.4" fill="rgba(255,255,255,.9)" />
      {/* feet */}
      <path d="M46 96c0 5 3 7 7 7M68 96c0 5-3 7-7 7" stroke={dark} strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
    {adult && <span className="absolute -right-1 -top-1 text-flame"><Sparkles className="size-5" /></span>}
  </div>;
}


type Challenge = { id: string; title: string; note: string; xp: number; target: number; progress: (ctx: ChallengeCtx) => number };
type ChallengeCtx = { tasksDone: number; tasksTotal: number; streak: number; level: number; xp: number };
const CHALLENGE_POOL: Challenge[] = [
  { id: 'finish-5', title: 'Finish five things', note: 'Any five tasks, whenever they happen.', xp: 40, target: 5, progress: (c) => c.tasksDone },
  { id: 'early-3', title: 'Three before the day gets loud', note: 'Tick off three tasks in one go.', xp: 30, target: 3, progress: (c) => c.tasksDone },
  { id: 'streak-3', title: 'Three days in a row', note: 'Keep the streak alive for three days.', xp: 50, target: 3, progress: (c) => c.streak },
  { id: 'streak-7', title: 'A full week of showing up', note: 'Seven straight days on the streak.', xp: 90, target: 7, progress: (c) => c.streak },
  { id: 'plan-day', title: 'Fill your shelf', note: 'Have at least four tasks waiting for you.', xp: 25, target: 4, progress: (c) => c.tasksTotal },
  { id: 'clear-shelf', title: 'Clear the shelf', note: 'Finish everything you put on the list.', xp: 60, target: 1, progress: (c) => (c.tasksTotal > 0 && c.tasksDone >= c.tasksTotal ? 1 : 0) },
];
function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function weeklyChallenges(key: string) {
  const seed = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  const count = 3;
  const picked: Challenge[] = [];
  for (let i = 0; i < count; i += 1) {
    let index = (seed * (i + 3) + i * 7) % CHALLENGE_POOL.length;
    while (picked.includes(CHALLENGE_POOL[index]!)) index = (index + 1) % CHALLENGE_POOL.length;
    picked.push(CHALLENGE_POOL[index]!);
  }
  return picked;
}
function daysUntilWeekEnd() {
  const day = new Date().getDay() || 7;
  return 8 - day;
}

function XpBurst({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1900);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center lg:bottom-12" role="status" data-testid="popup-xp-burst">
    <div className="pop-in flex items-center gap-2 rounded-full border border-flame/40 bg-[#2a241f] px-5 py-3 shadow-[0_10px_34px_rgba(0,0,0,.45)]">
      <Sparkles className="size-4 text-flame" />
      <span className="font-display text-base font-semibold text-flame">+{amount} XP</span>
      <span className="text-[13px] text-[#a49b8a]">Challenge complete</span>
    </div>
  </div>;
}

function RewardsView({ xp, streak, tasksTotal, tasksDone, seed, onBack, onAward }: {
  xp: number;
  streak: number;
  tasksTotal: number;
  tasksDone: number;
  seed?: string;
  onBack: () => void;
  onAward: (amount: number) => void;
}) {
  const level = levelFromXp(Math.max(0, xp));
  const stageIndex = eggStageIndex(level);
  const stage = EGG_STAGES[stageIndex]!;
  const nextStage = EGG_STAGES[stageIndex + 1];
  const [key, setKey] = useState(() => weekKey());
  const storageKey = `habitot-challenges-${seed ?? 'local'}`;
  const challenges = useMemo(() => weeklyChallenges(key), [key]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [burst, setBurst] = useState<number | null>(null);

  // Roll over to a fresh set of challenges as soon as a new week starts.
  useEffect(() => {
    const tick = () => setKey((current) => {
      const now = weekKey();
      return now === current ? current : now;
    });
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const readLocal = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const saved = raw ? (JSON.parse(raw) as { week?: string; ids?: string[] }) : null;
      return saved && saved.week === key && Array.isArray(saved.ids) ? saved.ids : [];
    } catch { return []; }
  }, [storageKey, key]);

  // Claims live on the account, so claiming on one device also claims it on the
  // others. On-device storage is only the offline fallback.
  useEffect(() => {
    let active = true;
    const local = readLocal();
    setClaimed(local);
    void getChallengeClaims(key).then((cloud) => {
      if (!active || !cloud) return;
      const merged = Array.from(new Set([...cloud, ...local]));
      setClaimed(merged);
      try { window.localStorage.setItem(storageKey, JSON.stringify({ week: key, ids: merged })); } catch { /* private mode */ }
      if (merged.length !== cloud.length) void saveChallengeClaims(key, merged);
    });
    return () => { active = false; };
  }, [storageKey, key, readLocal]);

  const claim = async (challenge: Challenge) => {
    if (claimed.includes(challenge.id)) return;
    // Re-check the account first so a claim from another device blocks this one.
    const cloud = await getChallengeClaims(key);
    if (cloud && cloud.includes(challenge.id)) {
      setClaimed(Array.from(new Set([...claimed, ...cloud])));
      return;
    }
    const next = Array.from(new Set([...(cloud ?? []), ...claimed, challenge.id]));
    setClaimed(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify({ week: key, ids: next })); } catch { /* private mode */ }
    void saveChallengeClaims(key, next);
    onAward(challenge.xp);
    setBurst(challenge.xp);
  };

  const ctx: ChallengeCtx = { tasksDone, tasksTotal, streak, level, xp };

  return <div className="max-w-[820px] space-y-4 pb-28 lg:pb-4" data-testid="view-rewards">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="eyebrow text-flame">Earned, not bought</div>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Rewards</h2>
        <p className="mt-2 text-sm text-[#9f9688]">Your companion grows with your levels, and a fresh set of small challenges lands every week.</p>
      </div>
      <button type="button" onClick={onBack} className="press shrink-0 rounded-[10px] border border-line px-3.5 py-2 text-xs font-semibold text-cream hover:border-flame" data-testid="button-rewards-back">Back</button>
    </div>

    <section className="relative overflow-hidden rounded-[16px] border border-line bg-surface p-5" data-testid="card-companion-egg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-flame/10 to-transparent" />
      <div className="relative flex flex-wrap items-center gap-6">
        <CompanionEgg level={level} seed={seed ?? 'habitot'} />
        <div className="min-w-[220px] flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[.18em] text-[#a49b8a]">Companion egg</div>
          <div className="mt-2 font-display text-2xl font-semibold tracking-[-.04em]" data-testid="text-egg-stage">{stage.name}</div>
          <p className="mt-2 text-[15px] leading-6 text-[#a49b8a]">{stage.note}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full bg-flame/10 px-2.5 py-1 font-mono text-[12px] text-flame">Level {level}</span>
            {nextStage ? <span className="text-[#9f9688]">Next change at level {nextStage.min}</span> : <span className="text-teal">Fully grown</span>}
          </div>
          <div className="mt-4 flex gap-1.5">
            {EGG_STAGES.map((item, index) => <span key={item.min} className={`h-1.5 flex-1 rounded-full ${index <= stageIndex ? 'bg-flame' : 'bg-[#3b332b]'}`} />)}
          </div>
        </div>
      </div>
    </section>

    <section className="rounded-[16px] border border-line bg-surface p-5" data-testid="card-weekly-challenges">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">Weekly challenges</h3>
        <span className="font-mono text-[12px] uppercase tracking-[.14em] text-[#8e8578]">Resets in {daysUntilWeekEnd()} day{daysUntilWeekEnd() === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-4 grid gap-3">
        {challenges.map((challenge) => {
          const current = Math.min(challenge.target, Math.max(0, challenge.progress(ctx)));
          const complete = current >= challenge.target;
          const isClaimed = claimed.includes(challenge.id);
          return <div key={challenge.id} className="rounded-[14px] border border-line bg-[#332d26] p-4" data-testid={`card-challenge-${challenge.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold">{challenge.title}</div>
                <p className="mt-1 text-[14px] leading-5 text-[#a49b8a]">{challenge.note}</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal/10 px-2.5 py-1 font-mono text-[12px] text-teal">+{challenge.xp} XP</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#241f1a]">
              <div className="h-full rounded-full bg-gradient-to-r from-flame to-teal" style={{ width: `${(current / challenge.target) * 100}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[12px] text-[#8e8578]">{current} / {challenge.target}</span>
              {isClaimed
                ? <span className="font-mono text-[12px] uppercase tracking-[.14em] text-teal" data-testid={`text-claimed-${challenge.id}`}>Claimed</span>
                : <button type="button" disabled={!complete} onClick={() => claim(challenge)} className="press rounded-[10px] bg-flame px-4 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-claim-${challenge.id}`}>{complete ? 'Claim reward' : 'Keep going'}</button>}
            </div>
          </div>;
        })}
      </div>
    </section>

    {burst !== null && <XpBurst amount={burst} onDone={() => setBurst(null)} />}
  </div>;
}

function ProfileView({ name, email, avatarUrl, xp, streak, tasksTotal, tasksDone, onLogout, onOpenRewards }: {
  name: string;
  email: string;
  avatarUrl?: string | null | undefined;
  xp: number;
  streak: number;
  tasksTotal: number;
  tasksDone: number;
  onLogout: () => void;
  onOpenRewards: () => void;
}) {
  const level = levelFromXp(Math.max(0, xp));
  const [pushState, setPushState] = useState<string>('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  const enableReminders = async () => {
    setPushBusy(true);
    setPushState('');
    try {
      const { enablePush } = await import('@/lib/push');
      const result = await enablePush();
      if (result.status === 'registered') {
        setPushOn(true);
        setPushState('Reminders are on for this device, even when Habitot is closed.');
      }
      else if (result.status === 'open-in-new-tab') setPushState('Open Habitot in its own browser tab (not this small preview window) and try again.');
      else if (result.status === 'denied') setPushState('Your browser is blocking notifications. Allow them for this site in your browser settings.');
      else if (result.status === 'unsupported') setPushState('This device or browser cannot receive reminders.');
      else setPushState('Reminders are not set up yet on this app.');
    } catch (error) {
      setPushState(error instanceof Error ? error.message : 'Unable to turn on reminders.');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestReminder = async () => {
    setPushBusy(true);
    setPushState('');
    try {
      const { sendReminder } = await import('@/lib/push.functions');
      const result = await sendReminder({ data: { title: 'Habitot', body: 'Time for your next task. Keep the streak going.' } });
      setPushState(result.sent > 0 ? `Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}. Check your notifications.` : 'No devices are registered yet — turn on reminders first.');
    } catch (error) {
      setPushState(error instanceof Error ? error.message : 'Unable to send a test reminder.');
    } finally {
      setPushBusy(false);
    }
  };

  return <div className="max-w-[820px] space-y-4 pb-28 lg:pb-4" data-testid="view-profile">
    <div><div className="eyebrow text-flame">Yours alone</div><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Profile</h2><p className="mt-2 text-sm text-[#9f9688]">Who you are here, and how Habitot should feel.</p></div>

    <section className="rounded-[16px] border border-line bg-surface p-5" data-testid="card-profile-summary">
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar avatarUrl={avatarUrl} name={name} />
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold tracking-[-.04em]" data-testid="text-profile-display-name">{name}</div>
          <div className="mt-1 truncate text-[15px] text-[#a49b8a]">{email}</div>
        </div>
        <Link href="/onboarding" className="press ml-auto rounded-[10px] border border-line px-3.5 py-2 text-xs font-semibold text-cream hover:border-flame" data-testid="link-edit-profile">Edit details</Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniMetric value={`L${level}`} label="Level" color="flame" />
        <MiniMetric value={String(Math.max(0, xp))} label="Total XP" color="teal" />
        <MiniMetric value={String(streak)} label="Day streak" color="coral" />
        <MiniMetric value={`${tasksDone}/${tasksTotal}`} label="Tasks done" color="teal" />
      </div>
    </section>

    <button type="button" onClick={onOpenRewards} className="press flex w-full items-center justify-between gap-4 rounded-[16px] border border-flame/30 bg-gradient-to-r from-flame/12 to-transparent p-5 text-left hover:border-flame" data-testid="button-open-rewards">
      <span className="flex items-center gap-3">
        <Sparkles className="size-5 text-flame" />
        <span>
          <span className="block font-display text-sm font-semibold">Rewards</span>
          <span className="mt-1 block text-[14px] text-[#a49b8a]">Your companion egg and this week&rsquo;s challenges.</span>
        </span>
      </span>
      <span className="font-mono text-[12px] uppercase tracking-[.14em] text-flame">Open</span>
    </button>

    <section className="rounded-[16px] border border-line bg-surface p-5" data-testid="card-appearance">
      <h3 className="font-display text-sm font-semibold">Appearance</h3>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><ThemeSwitch /><span className="text-[15px] text-[#a49b8a]">Light or dark</span></div>
        <div className="flex items-center gap-3"><AccentPicker /><span className="text-[15px] text-[#a49b8a]">Accent colour</span></div>
      </div>
    </section>

    <section className="rounded-[16px] border border-line bg-surface p-5" data-testid="card-reminders">
      <div className="flex items-center gap-2"><Bell className="size-4 text-flame" /><h3 className="font-display text-sm font-semibold">Reminders</h3></div>
      <p className="mt-2 text-[15px] leading-5 text-[#9f9688]">Get a gentle nudge on your phone and laptop, even when Habitot is closed. On a phone, install Habitot to your home screen first, then turn reminders on.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pushBusy} onClick={() => void enableReminders()} className="press rounded-[10px] bg-flame px-4 py-2.5 text-xs font-semibold text-ink disabled:opacity-60" data-testid="button-enable-push">{pushBusy ? 'Working…' : pushOn ? 'Reminders on' : 'Turn on reminders'}</button>
        <button type="button" disabled={pushBusy} onClick={() => void sendTestReminder()} className="press rounded-[10px] border border-line px-4 py-2.5 text-xs font-semibold text-cream hover:border-flame disabled:opacity-60" data-testid="button-test-push">Send a test</button>
      </div>
      {pushState && <p className="mt-3 text-xs text-[#a49b8a]" role="status">{pushState}</p>}
    </section>

    <button type="button" onClick={onLogout} className="press rounded-[10px] border border-coral/40 px-4 py-2.5 text-xs font-semibold text-coral hover:bg-coral/10" data-testid="button-profile-logout">Sign out</button>
  </div>;
}

function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      setMessage('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Both passwords need to match.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await setNewPassword(password);
      setDone(true);
      window.setTimeout(() => setLocation('/app'), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update your password.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="grain landing-glow flex min-h-[100dvh] items-center justify-center px-5 py-10 text-cream">
    <div className="w-full max-w-[440px]">
      <Link href="/" className="mb-8 inline-flex"><Wordmark /></Link>
      <div className="pop-in rounded-[20px] border border-line bg-surface p-5 sm:p-7" data-testid="page-reset-password">
        <div className="eyebrow text-flame">A fresh start</div>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-.06em]">Choose a new password.</h1>
        {done ? <p className="mt-4 text-sm text-teal" role="status">All set. Taking you to your space…</p> : <form className="mt-6 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" className="rounded-[10px] border border-line bg-[#2a241f] px-4 py-3 text-sm text-cream outline-none focus:border-flame" data-testid="input-new-password" />
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" required minLength={8} autoComplete="new-password" placeholder="Repeat new password" className="rounded-[10px] border border-line bg-[#2a241f] px-4 py-3 text-sm text-cream outline-none focus:border-flame" data-testid="input-confirm-password" />
          <button type="submit" disabled={busy} className="press rounded-[10px] bg-flame px-5 py-3 text-sm font-semibold text-ink disabled:opacity-60" data-testid="button-save-password">{busy ? 'Saving…' : 'Save new password'}</button>
        </form>}
        {message && <p className="mt-3 text-xs text-coral" role="alert">{message}</p>}
      </div>
    </div>
  </main>;
}

function Router() {
  return <RoutedErrorBoundary><AuthReturnHandler /><Switch><Route path="/" component={Landing} /><Route path="/login" component={LoginPage} /><Route path="/onboarding" component={OnboardingPage} /><Route path="/app" component={DashboardPreview} /><Route path="/reset-password" component={ResetPasswordPage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

/** After Google or email sign-in returns to the site, clean the URL and send the person to the right page. */
function AuthReturnHandler() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const hasAuthReturn = hash.includes('access_token') || hash.includes('error_description') || /[?&]code=/.test(search);
    if (!hasAuthReturn) return;

    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname);

    if (hash.includes('type=recovery')) {
      cleanUrl();
      setLocation('/reset-password');
      return;
    }

    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 24 && !cancelled; attempt += 1) {
        const session = await getSession().catch(() => null);
        if (session) {
          cleanUrl();
          const account = await getAccount().catch(() => null);
          if (!cancelled) setLocation(account?.profile?.onboarded ? '/app' : '/onboarding');
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (!cancelled) {
        cleanUrl();
        setLocation('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [setLocation]);
  return null;
}


function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  return <QueryClientProvider client={queryClient}><ThemeProvider><PlayerProvider><TooltipProvider>{booting ? <BootScreen /> : <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>}<Toaster /></TooltipProvider></PlayerProvider></ThemeProvider></QueryClientProvider>;
}

export default App;
