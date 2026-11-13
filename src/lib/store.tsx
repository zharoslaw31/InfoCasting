import AsyncStorage from '@react-native-async-storage/async-storage';
import * as H from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Platform } from 'react-native';
import { Item, LibraryEntry, Profile, Settings, SwipeKind } from './types';

const STORAGE_KEY = 'infocasting/state/v1';

export type ListName = 'liked' | 'saved' | 'read' | 'skipped';

type State = {
  ready: boolean;
  profile: Profile;
  settings: Settings;
  /** прочитати пізніше */
  liked: LibraryEntry[];
  /** збережено в Obsidian */
  saved: LibraryEntry[];
  /** прочитано (відкривав) */
  read: LibraryEntry[];
  /** пропущено свайпом */
  skipped: LibraryEntry[];
  history: { id: string; kind: SwipeKind; at: number }[];
  /** коли востаннє змінювали налаштування (для синхронізації) */
  settingsAt?: number;
  /** з яким акаунтом пов'язані дані на цьому пристрої */
  cloudUserId?: string | null;
  lastSyncAt?: number;
};

export const DEFAULT_SETTINGS: Settings = {
  haptics: true,
  translate: true,
  mutedSources: [],
  mutedGroups: [],
  obsidian: {
    method: 'github',
    vault: 'BAZA',
    folder: '2 Знання/2.3 Джерела',
    repo: 'zharoslaw31/BAZA',
    branch: '',
    token: '',
    withOriginal: true,
    comments: 15,
    syncToken: true,
    askBeforeSave: true,
  },
};

const initial: State = {
  ready: false,
  profile: { name: 'Читач', avatar: '🧠', createdAt: Date.now() },
  settings: DEFAULT_SETTINGS,
  liked: [],
  saved: [],
  read: [],
  skipped: [],
  history: [],
};

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'swipe'; item: Item; kind: SwipeKind }
  | { type: 'undo' }
  | { type: 'add'; item: Item; list: ListName; path?: string }
  | { type: 'remove'; id: string; list: ListName }
  | { type: 'clear'; list: ListName }
  | { type: 'markRead'; items: Item[] }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'obsidian'; obsidian: Partial<Settings['obsidian']> }
  | { type: 'profile'; profile: Partial<Profile> }
  | { type: 'resetLibrary' }
  | { type: 'applyCloud'; data: SyncData; userId: string; at: number }
  | { type: 'cloudLinked'; userId: string; at: number }
  | { type: 'signedOut' };

/** Налаштування, що їдуть в акаунт (без токена GitHub — він лишається лише на пристрої). */
type SyncPrefs = Omit<Settings, 'haptics' | 'onboarded' | 'obsidian'> & { obsidian: Omit<Settings['obsidian'], 'token'> & { token?: string } };

/** Те, що зберігається в хмарі для акаунта. */
export type SyncData = Pick<State, 'profile' | 'liked' | 'saved' | 'read' | 'skipped' | 'history'> & { prefs?: SyncPrefs; settingsAt?: number };

/** Прочитане й пропущене — без анонсів, щоб рядок в акаунті був невеликим. */
const lean = (list: LibraryEntry[], n: number) =>
  list.slice(0, n).map((e) => {
    const { x, xu, ...rest } = e.item;
    return { ...e, item: { ...rest, x: '' } };
  });

export const syncDataOf = (s: State): SyncData => {
  const { haptics, onboarded, obsidian, ...prefs } = s.settings;
  const { token, ...rest } = obsidian;
  // токен GitHub їде в акаунт лише з дозволу (Профіль → Obsidian), щоб база працювала на всіх пристроях
  const ob = obsidian.syncToken && token ? { ...rest, token } : rest;
  return {
    profile: s.profile,
    liked: s.liked,
    saved: s.saved,
    read: lean(s.read, 1500),
    skipped: lean(s.skipped, 1500),
    history: s.history.slice(-1000),
    prefs: { ...prefs, obsidian: ob },
    settingsAt: s.settingsAt ?? 0,
  };
};

const mergeList = (a: LibraryEntry[] = [], b: LibraryEntry[] = []) => {
  const map = new Map<string, LibraryEntry>();
  [...a, ...b].forEach((e) => {
    const cur = map.get(e.id);
    if (!cur || e.at > cur.at) map.set(e.id, { ...e, path: e.path ?? cur?.path, item: e.item.x || !cur ? e.item : cur.item });
  });
  return [...map.values()].sort((x, y) => y.at - x.at);
};

/** Об'єднання даних пристрою з даними акаунта. */
export const mergeSync = (local: SyncData, cloud: SyncData): SyncData => {
  const seen = new Set<string>();
  const newerPrefs = (cloud.settingsAt ?? 0) > (local.settingsAt ?? 0) ? cloud : local;
  return {
    profile: cloud.profile ?? local.profile,
    liked: mergeList(local.liked, cloud.liked),
    saved: mergeList(local.saved, cloud.saved),
    read: mergeList(local.read, cloud.read),
    skipped: mergeList(local.skipped, cloud.skipped),
    history: [...(cloud.history ?? []), ...local.history]
      .filter((h) => {
        const k = `${h.id}|${h.at}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((x, y) => x.at - y.at)
      .slice(-3000),
    prefs: newerPrefs.prefs ?? local.prefs,
    settingsAt: Math.max(local.settingsAt ?? 0, cloud.settingsAt ?? 0),
  };
};

const LIMIT: Record<ListName, number> = { liked: 2000, saved: 5000, read: 3000, skipped: 4000 };
const without = (list: LibraryEntry[], id: string) => list.filter((e) => e.id !== id);
const push = (list: LibraryEntry[], e: LibraryEntry, name: ListName) => [e, ...without(list, e.id)].slice(0, LIMIT[name]);

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return {
        ...s,
        ...a.state,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(a.state.settings ?? {}),
          obsidian: {
            ...DEFAULT_SETTINGS.obsidian,
            ...(a.state.settings?.obsidian ?? {}),
            // до оновлення за замовчуванням був спосіб «через Obsidian» — тепер основний шлях у базу через GitHub
            ...(a.state.settings?.obsidian && a.state.settings.obsidian.syncToken === undefined ? { method: 'github' as const } : {}),
          },
        },
        ready: true,
      };
    case 'swipe': {
      const at = Date.now();
      const e = { id: a.item.id, at, item: a.item };
      const history = [...s.history, { id: a.item.id, kind: a.kind, at }].slice(-3000);
      if (a.kind === 'like') return { ...s, history, liked: push(s.liked, e, 'liked'), skipped: without(s.skipped, e.id) };
      if (a.kind === 'nope') return { ...s, history, skipped: push(s.skipped, e, 'skipped'), liked: without(s.liked, e.id) };
      return { ...s, history }; // save — запис у saved додається після успішного збереження
    }
    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      const history = s.history.slice(0, -1);
      if (last.kind === 'nope') return { ...s, history, skipped: without(s.skipped, last.id) };
      // свайп вгору: якщо збереження не вдалось, матеріал потрапив у «Прочитати» — прибираємо і звідти
      if (last.kind === 'save') return { ...s, history, saved: without(s.saved, last.id), liked: without(s.liked, last.id) };
      return { ...s, history, liked: without(s.liked, last.id) };
    }
    case 'add': {
      const e: LibraryEntry = { id: a.item.id, at: Date.now(), item: a.item, ...(a.path ? { path: a.path } : {}) };
      const next = { ...s, [a.list]: push(s[a.list], e, a.list) };
      if (a.list === 'liked') next.skipped = without(s.skipped, e.id);
      return next;
    }
    case 'remove':
      return { ...s, [a.list]: without(s[a.list], a.id) };
    case 'clear':
      return { ...s, [a.list]: [] };
    case 'markRead': {
      let read = s.read;
      const ids = new Set(read.map((e) => e.id));
      for (const it of a.items) if (!ids.has(it.id)) read = [{ id: it.id, at: Date.now(), item: it }, ...read];
      return { ...s, read: read.slice(0, LIMIT.read) };
    }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.settings }, settingsAt: Date.now() };
    case 'obsidian':
      return { ...s, settings: { ...s.settings, obsidian: { ...s.settings.obsidian, ...a.obsidian } }, settingsAt: Date.now() };
    case 'profile':
      return { ...s, profile: { ...s.profile, ...a.profile } };
    case 'resetLibrary':
      return { ...s, liked: [], saved: [], read: [], skipped: [], history: [] };
    case 'applyCloud': {
      const p = a.data.prefs;
      return {
        ...s,
        profile: a.data.profile ?? s.profile,
        liked: a.data.liked ?? [],
        saved: a.data.saved ?? [],
        read: a.data.read ?? [],
        skipped: a.data.skipped ?? [],
        history: a.data.history ?? [],
        settings: p
          ? { ...s.settings, ...p, obsidian: { ...DEFAULT_SETTINGS.obsidian, ...s.settings.obsidian, ...p.obsidian, token: (p.obsidian.syncToken !== false && p.obsidian.token) || s.settings.obsidian.token } }
          : s.settings,
        settingsAt: a.data.settingsAt ?? s.settingsAt,
        cloudUserId: a.userId,
        lastSyncAt: a.at,
      };
    }
    case 'cloudLinked':
      return { ...s, cloudUserId: a.userId, lastSyncAt: a.at };
    case 'signedOut':
      return {
        ...s,
        liked: [],
        saved: [],
        read: [],
        skipped: [],
        history: [],
        profile: { ...initial.profile, createdAt: Date.now() },
        cloudUserId: null,
        lastSyncAt: undefined,
      };
  }
}

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  /** вже бачене в Кастингу (свайпнуте чи збережене) */
  seen: Set<string>;
  readIds: Set<string>;
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  isRead: (id: string) => boolean;
  savedPath: (id: string) => string | undefined;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? JSON.parse(raw) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { ready, ...persist } = state;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persist)).catch(() => {});
    }, 400);
  }, [state]);

  const value = useMemo<Ctx>(() => {
    const liked = new Set(state.liked.map((e) => e.id));
    const saved = new Map(state.saved.map((e) => [e.id, e.path]));
    const read = new Set(state.read.map((e) => e.id));
    const skipped = new Set(state.skipped.map((e) => e.id));
    return {
      state,
      dispatch,
      seen: new Set([...liked, ...saved.keys(), ...skipped]),
      readIds: read,
      isLiked: (id) => liked.has(id),
      isSaved: (id) => saved.has(id),
      isRead: (id) => read.has(id),
      savedPath: (id) => saved.get(id),
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function useHaptics() {
  const { state } = useStore();
  return useCallback(
    async (kind: 'light' | 'success' | 'warning' = 'light') => {
      if (!state.settings.haptics || Platform.OS === 'web') return;
      try {
        if (kind === 'light') await H.impactAsync(H.ImpactFeedbackStyle.Light);
        else await H.notificationAsync(kind === 'success' ? H.NotificationFeedbackType.Success : H.NotificationFeedbackType.Warning);
      } catch {}
    },
    [state.settings.haptics],
  );
}
