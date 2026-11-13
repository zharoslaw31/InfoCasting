import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import BUNDLED_SOURCES from '../../scripts/sources.json';
import { triggerFeedUpdate } from './obsidian';
import { useStore } from './store';
import { Area, Content, Feed, Item, Kind, Source } from './types';

/** Дані збирає GitHub Actions (Update feed) кожні 30 хвилин у гілку `data`. */
export const DATA_BASE = 'https://raw.githubusercontent.com/zharoslaw31/InfoCasting/data';
const CACHE_KEY = 'infocasting/feed/v1';
const REFRESH_MS = 10 * 60 * 1000;
/** GitHub запускає розклад нерегулярно (буває раз на кілька годин), тож застара стрічка сама просить збирання. */
const STALE_MS = 45 * 60 * 1000;
const KICK_KEY = 'infocasting/feed/kick';

export const KIND: Record<Kind, { label: string; many: string; emoji: string; icon: 'newspaper-outline' | 'paper-plane-outline' | 'logo-reddit' }> = {
  rss: { label: 'Блоги', many: 'Блоги й журнали', emoji: '📰', icon: 'newspaper-outline' },
  tg: { label: 'Telegram', many: 'Telegram-канали', emoji: '✈️', icon: 'paper-plane-outline' },
  reddit: { label: 'Reddit', many: 'Reddit', emoji: '👽', icon: 'logo-reddit' },
};

export const AREA: Record<Area, { label: string; emoji: string }> = {
  news: { label: 'Новини', emoji: '🇺🇦' },
  work: { label: 'Покликання', emoji: '💼' },
  res: { label: 'Ресурс', emoji: '🔋' },
  sense: { label: 'Сенс', emoji: '❤️' },
};
export const AREAS: Area[] = ['news', 'work', 'res', 'sense'];

type FeedCtx = {
  feed: Feed | null;
  sources: Source[];
  sourceOf: (id: string) => Source | undefined;
  loading: boolean;
  error: string | null;
  /** стрічку саме збирають на сервері (запущено з цього пристрою) */
  building: boolean;
  refresh: () => Promise<void>;
  byId: (id: string) => Item | undefined;
};

const Ctx = createContext<FeedCtx | null>(null);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [sources, setSources] = useState<Source[]>(BUNDLED_SOURCES as Source[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastLoad = useRef(0);
  const busy = useRef(false);
  const [building, setBuilding] = useState(false);
  const { state } = useStore();
  const token = state.ready ? state.settings.obsidian.token.trim() : '';

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const t = Math.floor(Date.now() / 60000);
      const [f, s] = await Promise.all([
        fetch(`${DATA_BASE}/feed.json?t=${t}`, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error(r.status === 404 ? 'Стрічка ще збирається — зазирніть за кілька хвилин' : `HTTP ${r.status}`);
          return r.json() as Promise<Feed>;
        }),
        fetch(`${DATA_BASE}/sources.json?t=${t}`)
          .then((r) => (r.ok ? (r.json() as Promise<Source[]>) : null))
          .catch(() => null),
      ]);
      setFeed(f);
      if (s?.length) setSources(s);
      setError(null);
      lastLoad.current = Date.now();
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ feed: f, sources: s })).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Немає зʼєднання');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // спершу — збережена копія (працює без інтернету), потім свіжа
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const c = JSON.parse(raw) as { feed: Feed; sources?: Source[] };
        setFeed((cur) => cur ?? c.feed);
        if (c.sources?.length) setSources(c.sources);
      })
      .catch(() => {})
      .finally(refresh);
  }, [refresh]);

  // оновлюємо, коли повертаємось у застосунок
  useEffect(() => {
    const maybe = () => {
      if (Date.now() - lastLoad.current > REFRESH_MS) refresh();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const h = () => document.visibilityState === 'visible' && maybe();
      document.addEventListener('visibilitychange', h);
      const iv = setInterval(maybe, REFRESH_MS);
      return () => {
        document.removeEventListener('visibilitychange', h);
        clearInterval(iv);
      };
    }
    const sub = AppState.addEventListener('change', (s) => s === 'active' && maybe());
    return () => sub.remove();
  }, [refresh]);

  // стрічка застара, а є ключ GitHub — просимо сервер зібрати свіже (не частіше разу на 30 хв з пристрою)
  const kicking = useRef(false);
  useEffect(() => {
    if (kicking.current || !feed || !token || loading || lastLoad.current === 0 || Date.now() - feed.updated < STALE_MS) return;
    kicking.current = true;
    (async () => {
      const k = JSON.parse((await AsyncStorage.getItem(KICK_KEY).catch(() => null)) ?? '{}') as { at?: number; denied?: number };
      if (Date.now() - (k.at ?? 0) < 30 * 60e3 || Date.now() - (k.denied ?? 0) < 6 * 3600e3) return;
      const ok = await triggerFeedUpdate(token, true).catch(() => false);
      AsyncStorage.setItem(KICK_KEY, JSON.stringify(ok ? { at: Date.now() } : { denied: Date.now() })).catch(() => {});
      if (!ok) return;
      setBuilding(true);
      // збирання триває 1–3 хвилини — підтягуємо результат
      [100e3, 180e3, 300e3].forEach((ms) => setTimeout(refresh, ms));
      setTimeout(() => setBuilding(false), 310e3);
    })().finally(() => setTimeout(() => (kicking.current = false), 60e3));
  }, [feed, token, loading, refresh]);

  useEffect(() => {
    if (building && feed && Date.now() - feed.updated < STALE_MS) setBuilding(false);
  }, [building, feed]);

  const value = useMemo<FeedCtx>(() => {
    const srcMap = new Map(sources.map((s) => [s.id, s]));
    const itemMap = new Map((feed?.items ?? []).map((it) => [it.id, it]));
    return { feed, sources, sourceOf: (id) => srcMap.get(id), loading, error, building, refresh, byId: (id) => itemMap.get(id) };
  }, [feed, sources, loading, error, building, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeed() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFeed must be used inside FeedProvider');
  return c;
}

// ───────────────────────── повний текст ─────────────────────────

const contentMemo = new Map<string, Content>();
export async function loadContent(id: string): Promise<Content> {
  const hit = contentMemo.get(id);
  if (hit) return hit;
  const res = await fetch(`${DATA_BASE}/c/${id}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const c = (await res.json()) as Content;
  contentMemo.set(id, c);
  return c;
}

// ───────────────────────── допоміжне ─────────────────────────

export const titleOf = (it: Item, translate = true) => (translate && it.tu ? it.tu : it.t);
export const excerptOf = (it: Item, translate = true) => {
  const x = translate && it.xu ? it.xu : it.x;
  if (it.k !== 'tg') return x;
  // у Telegram заголовок — це перший рядок поста, тож в анонсі його не повторюємо
  const t = it.t.replace(/…$/, '').trim();
  if (!t || !x.startsWith(t)) return x;
  const rest = x.slice(t.length).replace(/^[\s.,:;!—–-]+/, '').trim();
  return rest ? (it.t.endsWith('…') ? '…' + rest : rest) : '';
};

export function readMinutes(it: Pick<Item, 'w'>) {
  return Math.max(1, Math.round((it.w || 0) / 200));
}

export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function timeAgo(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'щойно';
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  if (d === 1) return 'вчора';
  if (d < 7) return `${d} ${plural(d, ['день', 'дні', 'днів'])} тому`;
  return new Date(ms).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export const shortNum = (n?: number) => (n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(n));

export function hostOf(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Смак: які джерела, групи й теми вподобані (для «Для тебе»). */
export type Taste = { src: Map<string, number>; group: Map<string, number>; kind: Map<string, number> };

export function buildTaste(liked: Item[], saved: Item[], skipped: Item[], sourceOf: (id: string) => Source | undefined): Taste {
  const t: Taste = { src: new Map(), group: new Map(), kind: new Map() };
  const add = (it: Item, w: number) => {
    const s = sourceOf(it.s);
    t.src.set(it.s, (t.src.get(it.s) ?? 0) + w);
    if (s) t.group.set(s.group, (t.group.get(s.group) ?? 0) + w);
    t.kind.set(it.k, (t.kind.get(it.k) ?? 0) + w * 0.3);
  };
  liked.forEach((it) => add(it, 1));
  saved.forEach((it) => add(it, 2));
  skipped.slice(0, 400).forEach((it) => add(it, -0.35));
  return t;
}

export function tasteScore(it: Item, taste: Taste, sourceOf: (id: string) => Source | undefined) {
  const s = sourceOf(it.s);
  const fresh = Math.max(0, 1 - (Date.now() - it.d) / (3 * 86400e3));
  return (taste.src.get(it.s) ?? 0) * 0.8 + (s ? (taste.group.get(s.group) ?? 0) : 0) * 0.5 + (taste.kind.get(it.k) ?? 0) + fresh * 1.5;
}

/** Колода «Уся стрічка»: впереміш джерела, свіже — першим, без 10 постів одного каналу поспіль. */
export function interleave(items: Item[]) {
  const bySrc = new Map<string, Item[]>();
  for (const it of [...items].sort((a, b) => b.d - a.d)) {
    if (!bySrc.has(it.s)) bySrc.set(it.s, []);
    bySrc.get(it.s)!.push(it);
  }
  const queues = [...bySrc.values()].sort((a, b) => b[0].d - a[0].d);
  const out: Item[] = [];
  let round = 0;
  while (out.length < items.length) {
    let added = false;
    for (const q of queues) {
      if (q[round]) {
        out.push(q[round]);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return out;
}
