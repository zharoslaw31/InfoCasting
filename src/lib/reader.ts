import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { loadContent } from './feed';
import { isForeign, translateMany } from './translate';
import { Block, Comment, Content, Item } from './types';

/** Переклад статті: ті самі блоки й коментарі, лише текст українською. */
export type Translated = { b: Block[]; cm?: Comment[] };

const TR_KEY = (id: string) => `infocasting/tr/${id}`;
const TR_INDEX = 'infocasting/tr-index';
const TR_KEEP = 150;

async function rememberTr(id: string, t: Translated) {
  try {
    await AsyncStorage.setItem(TR_KEY(id), JSON.stringify(t));
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(TR_INDEX)) ?? '[]');
    const next = [id, ...idx.filter((x) => x !== id)];
    const drop = next.slice(TR_KEEP);
    await AsyncStorage.setItem(TR_INDEX, JSON.stringify(next.slice(0, TR_KEEP)));
    if (drop.length) await AsyncStorage.multiRemove(drop.map(TR_KEY));
  } catch {}
}

async function recallTr(id: string): Promise<Translated | null> {
  try {
    const raw = await AsyncStorage.getItem(TR_KEY(id));
    return raw ? (JSON.parse(raw) as Translated) : null;
  } catch {
    return null;
  }
}

/** Чи є в матеріалі що перекладати. */
export const needsTranslation = (c: Content | null, it: Item) =>
  it.l === 'en' || !!c?.b.some((b) => b[0] !== 'img' && b[0] !== 'pre' && isForeign(b[1])) || !!c?.cm?.some((x) => isForeign(x.t));

export async function translateContent(it: Item, c: Content): Promise<Translated> {
  const cached = await recallTr(it.id);
  if (cached && (cached.cm?.length ?? 0) >= (c.cm?.length ?? 0)) return cached;
  const texts: string[] = [];
  const idx: number[] = [];
  c.b.forEach((b, i) => {
    if (b[0] === 'img' || b[0] === 'pre' || !isForeign(b[1])) return;
    texts.push(b[1]);
    idx.push(i);
  });
  const cmIdx: number[] = [];
  (c.cm ?? []).forEach((x, i) => {
    if (!isForeign(x.t)) return;
    texts.push(x.t);
    cmIdx.push(i);
  });
  const out = await translateMany(texts);
  const b = c.b.map((x) => [...x] as Block);
  idx.forEach((bi, k) => (b[bi] = [b[bi][0], out[k]]));
  const cm = c.cm?.map((x) => ({ ...x }));
  cmIdx.forEach((ci, k) => cm && (cm[ci] = { ...cm[ci], t: out[idx.length + k] }));
  const res = { b, cm };
  rememberTr(it.id, res);
  return res;
}

/** Повний текст + переклад (якщо треба). Коментарі Reddit, яких немає в даних, догружаємо з Reddit напряму. */
export function useArticle(it: Item | undefined, translate: boolean) {
  const [content, setContent] = useState<Content | null>(null);
  const [tr, setTr] = useState<Translated | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!it) return;
    let alive = true;
    setLoading(true);
    setContent(null);
    setTr(null);
    (async () => {
      let c: Content;
      try {
        c = await loadContent(it.id);
      } catch {
        // матеріалу вже немає в стрічці (старий запис із Бібліотеки) — показуємо анонс
        c = { b: it.x ? [['p', it.x]] : [] };
      }
      if (it.k === 'reddit' && !c.cm?.length && it.rid && (it.nc ?? 0) > 0) {
        const live = await liveRedditComments(it.rid).catch(() => null);
        if (live?.length) c = { ...c, cm: live };
      }
      if (!alive) return;
      setContent(c);
      setLoading(false);
    })().catch((e) => alive && (setError(String(e)), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [it?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!it || !content || !translate || tr || !needsTranslation(content, it)) return;
    let alive = true;
    setTranslating(true);
    setError(null);
    translateContent(it, content)
      .then((t) => alive && setTr(t))
      .catch(() => alive && setError('Не вдалося перекласти — показуємо оригінал'))
      .finally(() => alive && setTranslating(false));
    return () => {
      alive = false;
    };
  }, [it, content, translate, tr, attempt]);

  return { content, tr, loading, translating, error, retry: () => setAttempt((n) => n + 1) };
}

/** Коментарі напряму з Reddit (якщо збирач не встиг їх узяти). */
async function liveRedditComments(rid: string): Promise<Comment[]> {
  const res = await fetch(`https://www.reddit.com/comments/${rid}.json?sort=top&limit=25&depth=3&raw_json=1`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const out: Comment[] = [];
  const walk = (children: { kind: string; data: { author: string; score: number; body: string; stickied?: boolean; replies?: { data?: { children?: unknown[] } } } }[] | undefined, depth: number) => {
    for (const c of children ?? []) {
      if (out.length >= 30) return;
      if (c.kind !== 't1') continue;
      const d = c.data;
      if (d.stickied || d.author === 'AutoModerator' || /^\[(deleted|removed)\]$/.test(d.body)) continue;
      out.push({ a: d.author, s: d.score, t: mdPlain(d.body).slice(0, 3000), d: depth });
      if (depth < 2) walk((d.replies?.data?.children as typeof children)?.slice(0, depth ? 2 : 3), depth + 1);
    }
  };
  walk(data?.[1]?.data?.children, 0);
  return out;
}

/** Markdown коментаря Reddit → простий текст (посилання, жирний, курсив, цитати). */
const mdPlain = (t: string) =>
  t
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^&gt;\s?|^>\s?/gm, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
