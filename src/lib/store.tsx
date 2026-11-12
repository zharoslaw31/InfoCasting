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
};

export const DEFAULT_SETTINGS: Settings = {
  haptics: true,
  translate: true,
  mutedSources: [],
  mutedGroups: [],
  obsidian: {
    method: 'uri',
    vault: 'BAZA',
    folder: '2 Знання/2.3 Джерела',
    repo: 'zharoslaw31/BAZA',
    branch: '',
    token: '',
    withOriginal: true,
    comments: 15,
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
  | { type: 'markRead'; items: Item[] }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'obsidian'; obsidian: Partial<Settings['obsidian']> }
  | { type: 'profile'; profile: Partial<Profile> }
  | { type: 'resetLibrary' };

const LIMIT: Record<ListName, number> = { liked: 2000, saved: 5000, read: 3000, skipped: 4000 };
const without = (list: LibraryEntry[], id: string) => list.filter((e) => e.id !== id);
const push = (list: LibraryEntry[], e: LibraryEntry, name: ListName) => [e, ...without(list, e.id)].slice(0, LIMIT[name]);

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return {
        ...s,
        ...a.state,
        settings: { ...DEFAULT_SETTINGS, ...(a.state.settings ?? {}), obsidian: { ...DEFAULT_SETTINGS.obsidian, ...(a.state.settings?.obsidian ?? {}) } },
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
      const list: ListName = last.kind === 'like' ? 'liked' : last.kind === 'nope' ? 'skipped' : 'saved';
      return { ...s, history: s.history.slice(0, -1), [list]: without(s[list], last.id) };
    }
    case 'add': {
      const e: LibraryEntry = { id: a.item.id, at: Date.now(), item: a.item, ...(a.path ? { path: a.path } : {}) };
      const next = { ...s, [a.list]: push(s[a.list], e, a.list) };
      if (a.list === 'liked') next.skipped = without(s.skipped, e.id);
      return next;
    }
    case 'remove':
      return { ...s, [a.list]: without(s[a.list], a.id) };
    case 'markRead': {
      let read = s.read;
      const ids = new Set(read.map((e) => e.id));
      for (const it of a.items) if (!ids.has(it.id)) read = [{ id: it.id, at: Date.now(), item: it }, ...read];
      return { ...s, read: read.slice(0, LIMIT.read) };
    }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'obsidian':
      return { ...s, settings: { ...s.settings, obsidian: { ...s.settings.obsidian, ...a.obsidian } } };
    case 'profile':
      return { ...s, profile: { ...s.profile, ...a.profile } };
    case 'resetLibrary':
      return { ...s, liked: [], saved: [], read: [], skipped: [], history: [] };
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
