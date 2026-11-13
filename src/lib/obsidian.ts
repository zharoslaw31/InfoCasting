import { Linking, Platform } from 'react-native';
import { Translated } from './reader';
import { Block, Comment, Content, Item, Settings, Source } from './types';

/**
 * Збереження матеріалу в базу Obsidian як нотатку-джерело — у тому ж форматі,
 * що й кнопка «📚 У Джерела» в базі: властивості, «Про що це», «3 ключові думки»,
 * «Матеріал» (переклад + оригінал у згорнутій виносці), «Що з цього виросло».
 *
 * Способи:
 *  - github — нотатка одразу комітиться в репозиторій бази (obsidian-git підтягне її сам);
 *  - uri    — відкривається Obsidian на цьому пристрої (obsidian://new);
 *  - file   — завантажується .md-файл.
 */

type Opts = Settings['obsidian'];

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const yamlStr = (s?: string) => (s ? JSON.stringify(s) : '');
export const cleanName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110)
    .replace(/[\s.]+$/, '');

function blocksToMd(blocks: Block[]) {
  const out: string[] = [];
  let prev = '';
  for (const [type, v] of blocks) {
    if (type !== 'li' && prev === 'li') out.push('');
    if (type === 'p') out.push(v, '');
    else if (type === 'h') out.push('### ' + v, '');
    else if (type === 'li') out.push('- ' + v.replace(/\n+/g, ' '));
    else if (type === 'q') out.push(...v.split('\n').map((l) => '> ' + l), '');
    else if (type === 'pre') out.push('```', v, '```', '');
    else if (type === 'img') out.push(`![](${v})`, '');
    prev = type;
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function commentsToMd(cm: Comment[], max: number) {
  const out: string[] = [];
  for (const c of cm.slice(0, max)) {
    const ind = '    '.repeat(c.d);
    const lines = c.t.trim().split(/\n+/);
    out.push(`${ind}- **u/${c.a}** · ⬆ ${c.s}`);
    for (const l of lines) out.push(`${ind}  ${l}`);
  }
  return out;
}

export type NoteStatus = 'хочу' | 'читаю' | 'прочитано';
/** Що користувач уточнив у вікні збереження. */
export type NoteExtra = { title?: string; topic?: string | null; thoughts?: string; status?: NoteStatus };

export function defaultTitle(it: Item) {
  return cleanName(it.tu ?? it.t) || 'Без назви';
}

/** Свої думки з вікна збереження → пункти «3 ключові думки» (кожен рядок — окремий пункт). */
function thoughtLines(t?: string) {
  const lines = (t ?? '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
  const out = lines.map((l, i) => `${i + 1}. ${l}`);
  for (let i = out.length; i < 3; i++) out.push(`${i + 1}. `);
  return out;
}

export function buildNote(it: Item, src: Source | undefined, content: Content | null, tr: Translated | null, o: Opts, x: NoteExtra = {}) {
  const translated = !!tr && it.l === 'en';
  const title = cleanName(x.title ?? '') || defaultTitle(it);
  const status: NoteStatus = x.status ?? 'хочу';
  const today = stamp().slice(0, 10);
  const blocks = (tr?.b ?? content?.b ?? []).length ? (tr?.b ?? content!.b) : it.x ? ([['p', it.xu ?? it.x]] as Block[]) : [];
  const fmt = it.k === 'rss' ? 'стаття' : 'пост';
  const author = it.k === 'reddit' ? [it.a, it.r].filter(Boolean).join(' · ') : it.a || src?.name || '';
  const topic = x.topic === undefined ? src?.topic : x.topic;
  const tags = ['тип/джерело', 'стан/зерно', ...(topic ? [topic] : [])];
  const lines = [
    '---',
    'tags:',
    ...tags.map((t) => '  - ' + t),
    'створено: ' + stamp(),
    'формат: ' + fmt,
    'статус: ' + status,
    'оцінка: ',
    'автор: ' + yamlStr(author),
    'рік: ' + new Date(it.d).getFullYear(),
    'посилання: ' + it.u,
    'обкладинка: ' + (it.i ?? ''),
    'почав: ' + (status === 'хочу' ? '' : today),
    'закінчив: ' + (status === 'прочитано' ? today : ''),
    'джерело: ' + yamlStr(src?.name ?? ''),
    '---',
    '# ' + title,
  ];
  if (it.tu && it.tu !== it.t) lines.push('*' + it.t.replace(/\*/g, '') + '*');
  lines.push('', '```baze', 'твір', '```', '', '## Про що це (1–2 речення)', (it.xu ?? it.x).slice(0, 400), '', '## 3 ключові думки', ...thoughtLines(x.thoughts), '', '## Матеріал');
  lines.push(...blocksToMd(blocks));
  if (it.e) lines.push('', `[${it.k === 'tg' ? 'Посилання з поста' : 'Посилання'}](${it.e})`);
  const linkLabel = it.k === 'tg' ? 'Пост у Telegram' : it.k === 'reddit' ? 'Допис на Reddit' : 'Оригінал статті';
  lines.push('', `[${linkLabel}](${it.u})`);
  if (translated && o.withOriginal && content?.b.length) {
    lines.push('', '> [!quote]- Оригінал', ...blocksToMd(content.b).map((l) => (l ? '> ' + l : '>')));
  }
  const cm = tr?.cm ?? content?.cm;
  if (it.k === 'reddit' && cm?.length && o.comments > 0) {
    lines.push('', `### 💬 Коментарі (${Math.min(cm.length, o.comments)} з ${it.nc ?? cm.length})`, ...commentsToMd(cm, o.comments));
    if (translated && o.withOriginal && content?.cm?.length) {
      lines.push('', '> [!quote]- Коментарі в оригіналі', ...commentsToMd(content.cm, o.comments).map((l) => '> ' + l));
    }
  }
  lines.push('', '## Що з цього виросло', '```baze', 'ріст', '```', '');
  return { title, md: lines.join('\n') };
}

// ───────────────────────── збереження ─────────────────────────

export type SaveResult = { ok: true; path: string; how: string; open?: string } | { ok: false; error: string };

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function gh(o: Opts, path: string, init?: RequestInit) {
  return fetch(`https://api.github.com/repos/${o.repo}${path ? '/' + path : ''}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${o.token.trim()}`, 'x-github-api-version': '2022-11-28', ...(init?.headers ?? {}) },
  });
}

async function saveGithub(o: Opts, title: string, md: string): Promise<SaveResult> {
  if (!o.token.trim() || !o.repo.includes('/')) return { ok: false, error: 'Вкажіть репозиторій бази і токен GitHub у Профілі → Obsidian' };
  const ref = o.branch ? `?ref=${encodeURIComponent(o.branch)}` : '';
  let path = '';
  for (let n = 1; n < 30; n++) {
    const p = `${o.folder.replace(/\/+$/, '')}/${title}${n > 1 ? ' ' + n : ''}.md`;
    const r = await gh(o, `contents/${encPath(p)}${ref}`);
    if (r.status === 404) {
      path = p;
      break;
    }
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'GitHub не пускає: перевірте токен (потрібен доступ Contents: Read and write до репозиторію бази)' };
    if (!r.ok) return { ok: false, error: `GitHub: HTTP ${r.status}` };
  }
  if (!path) return { ok: false, error: 'Забагато нотаток з такою назвою' };
  const res = await gh(o, `contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: `InfoCasting: ${title}`, content: b64(md), ...(o.branch ? { branch: o.branch } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: `GitHub: ${(err as { message?: string }).message ?? 'HTTP ' + res.status}` };
  }
  return { ok: true, path, how: 'у репозиторій бази' };
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function saveUri(o: Opts, title: string, md: string, defer = false): Promise<SaveResult> {
  const file = `${o.folder.replace(/\/+$/, '')}/${title}`;
  const base = `obsidian://new?vault=${encodeURIComponent(o.vault)}&file=${encodeURIComponent(file)}`;
  let url = `${base}&content=${encodeURIComponent(md)}`;
  // довгі нотатки — через буфер обміну (адреса має межу довжини)
  if (url.length > 12000 && Platform.OS === 'web' && (await copy(md))) url = `${base}&clipboard=true`;
  // браузер блокує obsidian:// після довгого очікування (переклад) — тоді відкриваємо окремим дотиком
  if (defer) return { ok: true, path: file + '.md', how: 'в Obsidian', open: url };
  try {
    if (Platform.OS === 'web') window.location.href = url;
    else await Linking.openURL(url);
    return { ok: true, path: file + '.md', how: 'в Obsidian' };
  } catch {
    return { ok: false, error: 'Не вдалося відкрити Obsidian на цьому пристрої' };
  }
}

function saveFile(title: string, md: string): SaveResult {
  if (Platform.OS !== 'web') return { ok: false, error: 'Завантаження файлу працює у браузері' };
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { ok: true, path: title + '.md', how: 'файлом' };
}

export async function saveToObsidian(o: Opts, title: string, md: string, defer = false): Promise<SaveResult> {
  try {
    if (o.method === 'github') return await saveGithub(o, title, md);
    if (o.method === 'file') return saveFile(title, md);
    return await saveUri(o, title, md, defer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Помилка збереження' };
  }
}

/** Посилання, що відкриває збережену нотатку в Obsidian. */
export const obsidianOpenUrl = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;

/** Перевірити доступ до бази: повертає основну гілку або помилку. */
export async function checkBase(o: Opts): Promise<{ ok: true; branch: string; folderExists: boolean } | { ok: false; error: string }> {
  if (!o.token.trim()) return { ok: false, error: 'Вставте токен' };
  try {
    const r = await gh(o, '');
    if (r.status === 401) return { ok: false, error: 'Токен недійсний — створіть новий' };
    if (r.status === 404 || r.status === 403) return { ok: false, error: `Токен не бачить ${o.repo}: у токені виберіть цей репозиторій (Repository access → Only select repositories)` };
    if (!r.ok) return { ok: false, error: `GitHub: HTTP ${r.status}` };
    const d = (await r.json()) as { permissions?: { push?: boolean }; default_branch?: string };
    if (d.permissions && d.permissions.push === false) return { ok: false, error: 'Токен може лише читати базу: дайте Contents → Read and write' };
    const branch = o.branch || d.default_branch || 'main';
    const f = await gh(o, `contents/${encPath(o.folder.replace(/\/+$/, ''))}?ref=${encodeURIComponent(branch)}`);
    return { ok: true, branch, folderExists: f.ok };
  } catch {
    return { ok: false, error: 'Немає зʼєднання з GitHub' };
  }
}

export async function copyMarkdown(md: string) {
  return copy(md);
}

/** Запустити збирання стрічки зараз (потрібен токен з доступом Actions до репозиторію InfoCasting). */
export async function triggerFeedUpdate(token: string, auto = false) {
  const r = await fetch('https://api.github.com/repos/zharoslaw31/InfoCasting/actions/workflows/update-feed.yml/dispatches', {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify(auto ? { ref: 'main', inputs: { auto: true } } : { ref: 'main' }),
  });
  return r.status === 204;
}
