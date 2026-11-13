import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { mergeSync, SyncData, syncDataOf, useStore } from './store';

if (Platform.OS !== 'web') {
  // supabase-js на Android/iOS потребує повноцінного URL
  require('react-native-url-polyfill/auto');
}

/**
 * Хмарний акаунт (Supabase): email + пароль
 * (один рядок на користувача, доступ лише до власного рядка через RLS).
 * Акаунти спільні з MovieCasting і CookCasting (той самий проєкт Supabase), бібліотека InfoCasting — у власній таблиці `info_libraries`.
 */
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudEnabled = !!(URL_ && KEY);
const TABLE = 'info_libraries';

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(URL_, KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

const SITE_URL = Platform.OS === 'web' && typeof location !== 'undefined' ? `${location.origin}/InfoCasting/` : 'https://zharoslaw31.github.io/InfoCasting/';

/**
 * Посилання з листа (підтвердження email / відновлення пароля) повертає на сайт
 * з токенами в адресі після «#». Забираємо їх одразу при завантаженні і чистимо адресу.
 */
const urlAuth = (() => {
  if (Platform.OS !== 'web' || typeof location === 'undefined' || !location.hash) return null;
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  const error = h.get('error_description');
  if (!access_token && !error) return null;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {}
  return { access_token, refresh_token, type: h.get('type'), error };
})();

type Row = { data: SyncData; updated_at: string };

/** Чи є на пристрої зміни, зроблені після останньої синхронізації. */
const changedSince = (d: SyncData, t: number) =>
  [...d.liked, ...d.saved, ...d.read, ...d.skipped].some((e) => e.at > t) || d.history.some((h) => h.at > t) || (d.settingsAt ?? 0) > t;

async function pull(userId: string): Promise<Row | null> {
  const { data, error } = await supabase!.from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as Row) ?? null;
}

async function push(userId: string, data: SyncData): Promise<number> {
  const now = new Date();
  const { error } = await supabase!.from(TABLE).upsert({ user_id: userId, data, updated_at: now.toISOString() });
  if (error) throw error;
  return now.getTime();
}

type Status = 'off' | 'idle' | 'syncing' | 'synced' | 'error';

type AuthCtx = {
  enabled: boolean;
  email: string | null;
  userId: string | null;
  status: Status;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => void;
  resetPassword: (email: string) => Promise<string | null>;
  /** true — користувач прийшов за посиланням «відновити пароль» і має задати новий */
  recovery: boolean;
  updatePassword: (password: string) => Promise<string | null>;
  cancelRecovery: () => void;
  /** повідомлення після переходу за посиланням з листа */
  notice: { text: string; ok: boolean } | null;
  clearNotice: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

const humanError = (msg: string) => {
  if (/info_libraries|relation .* does not exist|schema cache/i.test(msg)) return 'Хмару ще не налаштовано: потрібна таблиця info_libraries';
  if (/expired|invalid.*link|link.*invalid/i.test(msg)) return 'Посилання застаріло — надішліть лист ще раз';
  if (/invalid login/i.test(msg)) return 'Невірний email або пароль';
  if (/already registered|already been registered/i.test(msg)) return 'Такий email уже зареєстровано — увійдіть';
  if (/password should be at least/i.test(msg)) return 'Пароль має містити щонайменше 6 символів';
  if (/email.*invalid|invalid.*email/i.test(msg)) return 'Перевірте email';
  if (/rate limit|too many/i.test(msg)) return 'Забагато спроб — зачекайте хвилину';
  if (/same.*password|different from the old/i.test(msg)) return 'Новий пароль має відрізнятися від старого';
  if (/not confirmed|confirm/i.test(msg)) return 'Підтвердьте email за посиланням у листі';
  if (/fetch|network/i.test(msg)) return 'Немає з’єднання з сервером';
  return msg;
};

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>(cloudEnabled ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastPushedJson = useRef<string>('');
  const linking = useRef(false);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNoticeRaw] = useState<{ text: string; ok: boolean } | null>(null);
  const setNotice = (text: string, ok = false) => setNoticeRaw({ text, ok });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s);
      if (e === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    // роутер під час старту повертає адресу з токенами — чистимо ще кілька разів
    if (urlAuth) {
      const clean = () => {
        if (typeof location !== 'undefined' && /access_token|error_description/.test(location.hash)) {
          try {
            history.replaceState(history.state, '', location.pathname + location.search);
          } catch {}
        }
      };
      [300, 1000, 2500].forEach((ms) => setTimeout(clean, ms));
    }
    if (urlAuth?.error) setNotice(humanError(urlAuth.error));
    else if (urlAuth?.access_token && urlAuth.refresh_token) {
      supabase.auth.setSession({ access_token: urlAuth.access_token, refresh_token: urlAuth.refresh_token }).then(({ error: e }) => {
        if (e) setNotice(humanError(e.message));
        else if (urlAuth.type === 'recovery') setRecovery(true);
        else setNotice('Email підтверджено — ви увійшли в акаунт', true);
      });
    }
    return () => data.subscription.unsubscribe();
  }, []);

  /** Перший вхід на пристрої: об'єднуємо гостьові дані з хмарою; повторний — підтягуємо свіжіше. */
  const link = useCallback(async () => {
    if (!supabase || !userId || linking.current) return;
    const s = stateRef.current;
    if (!s.ready) return;
    linking.current = true;
    setStatus('syncing');
    try {
      const row = await pull(userId);
      const local = syncDataOf(s);
      let next: SyncData;
      if (!row) next = local;
      else if (s.cloudUserId === userId) {
        // дані цього акаунта вже на пристрої
        const last = s.lastSyncAt ?? 0;
        if (new Date(row.updated_at).getTime() <= last) next = local; // у хмарі нічого нового
        else next = changedSince(local, last) ? mergeSync(local, row.data) : row.data; // змінювали і тут, і на іншому пристрої — об'єднуємо
      } else if (s.cloudUserId) next = row.data; // на пристрої були дані іншого акаунта
      else next = mergeSync(local, row.data); // гостьові дані + акаунт
      const at = JSON.stringify(next) === JSON.stringify(row?.data) ? new Date(row!.updated_at).getTime() : await push(userId, next);
      lastPushedJson.current = JSON.stringify(next);
      dispatch({ type: 'applyCloud', data: next, userId, at });
      setStatus('synced');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(humanError(e instanceof Error ? e.message : String(e)));
    } finally {
      linking.current = false;
    }
  }, [userId, dispatch]);

  useEffect(() => {
    if (userId && state.ready) link();
  }, [userId, state.ready, link]);

  // повернулись у додаток — перевіряємо, чи не змінилось на іншому пристрої
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && link());
    const onVis = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && link();
    const onOnline = () => link(); // з'явився інтернет — дозберігаємо
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('online', onOnline);
    }
    return () => {
      sub.remove();
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('online', onOnline);
      }
    };
  }, [userId, link]);

  // будь-яка зміна бібліотеки → зберігаємо в хмару (з невеликою затримкою)
  const syncJson = JSON.stringify(syncDataOf(state));
  useEffect(() => {
    if (!supabase || !userId || state.cloudUserId !== userId || syncJson === lastPushedJson.current) return;
    const t = setTimeout(async () => {
      if (linking.current) return;
      setStatus('syncing');
      try {
        const data = JSON.parse(syncJson) as SyncData;
        const at = await push(userId, data);
        lastPushedJson.current = syncJson;
        dispatch({ type: 'cloudLinked', userId, at });
        setStatus('synced');
        setError(null);
      } catch (e) {
        setStatus('error');
        setError(humanError(e instanceof Error ? e.message : String(e)));
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [syncJson, userId, state.cloudUserId, dispatch]);

  const value: AuthCtx = {
    enabled: cloudEnabled,
    email: session?.user.email ?? null,
    userId,
    status,
    error,
    signIn: async (email, password) => {
      if (!supabase) return 'Хмара не налаштована';
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return e ? humanError(e.message) : null;
    },
    signUp: async (email, password) => {
      if (!supabase) return 'Хмара не налаштована';
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // посилання з листа веде назад на сайт
        options: { emailRedirectTo: SITE_URL },
      });
      // Supabase не каже, що email уже зайнятий (захист від перебору), а повертає користувача без ролей
      if (!e && !data.session && data.user && !data.user.identities?.length) return 'Такий email уже зареєстровано — увійдіть';
      if (e) return humanError(e.message);
      if (!data.session) return 'Ми надіслали лист — натисніть посилання в ньому, потім поверніться сюди й увійдіть';
      return null;
    },
    signOut: async () => {
      // перед виходом — останнє збереження
      if (supabase && userId && stateRef.current.cloudUserId === userId) {
        try {
          await push(userId, syncDataOf(stateRef.current));
        } catch {}
      }
      await supabase?.auth.signOut();
      lastPushedJson.current = '';
      dispatch({ type: 'signedOut' });
      setStatus('idle');
    },
    syncNow: () => link(),
    resetPassword: async (email) => {
      if (!supabase) return 'Хмара не налаштована';
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL });
      return e ? humanError(e.message) : null;
    },
    recovery,
    updatePassword: async (password) => {
      if (!supabase) return 'Хмара не налаштована';
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) return humanError(e.message);
      setRecovery(false);
      setNotice('Пароль змінено', true);
      return null;
    },
    cancelRecovery: () => setRecovery(false),
    notice,
    clearNotice: () => setNoticeRaw(null),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud must be used inside CloudProvider');
  return c;
}
