/**
 * Переклад англійських текстів українською прямо в додатку (Google Translate, без ключа).
 * Тексти перекладаються пакетами; результат кешується в пам'яті, а перекладені статті —
 * на пристрої (див. reader.ts), тож кожна стаття перекладається лише раз.
 */

const SEP = '\n¶¶\n';
const MAX = 3800;
const memo = new Map<string, string>();

async function gtx(text: string, tries = 3): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uk&dt=t', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'q=' + encodeURIComponent(text),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return ((d?.[0] ?? []) as unknown[][]).map((s) => (s?.[0] as string) ?? '').join('');
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

/** Перекладає масив рядків; порядок зберігається. */
export async function translateMany(texts: string[]): Promise<string[]> {
  const todo = [...new Set(texts.filter((t) => t && !memo.has(t)))];
  const batches: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const t of todo) {
    if (cur.length && len + t.length + SEP.length > MAX) {
      batches.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(t);
    len += t.length + SEP.length;
  }
  if (cur.length) batches.push(cur);

  const run = async (batch: string[]) => {
    let parts: string[] | null = null;
    if (batch.length > 1) {
      const out = await gtx(batch.join(SEP));
      parts = out.split(/\s*¶\s*¶\s*/);
      if (parts.length !== batch.length) parts = null;
    }
    if (!parts) parts = await Promise.all(batch.map((t) => gtx(t)));
    batch.forEach((t, i) => memo.set(t, fixText(parts![i].trim())));
  };
  for (let i = 0; i < batches.length; i += 3) await Promise.all(batches.slice(i, i + 3).map(run));
  return texts.map((t) => (t ? (memo.get(t) ?? t) : ''));
}

export async function translateOne(text: string) {
  return (await translateMany([text]))[0];
}

/** Переклад з української англійською (для пошуку). */
export async function toEnglish(text: string): Promise<string> {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const d = await res.json();
    return ((d?.[0] ?? []) as unknown[][]).map((s) => (s?.[0] as string) ?? '').join('') || text;
  } catch {
    return text;
  }
}

export function fixText(s: string) {
  return s.replace(/\s+([,.;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

export function isForeign(text: string) {
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  return lat + cyr > 0 && lat / (lat + cyr) > 0.6 && /[A-Za-z]{3}/.test(text);
}
