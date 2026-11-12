/**
 * Збирає стрічку InfoCasting: блоги (RSS/Atom), Telegram-канали (t.me/s) і Reddit,
 * перекладає англійські заголовки й анонси українською і пише готові дані в теку виводу:
 *
 *   feed.json      усі свіжі матеріали (заголовки, анонси, картинки, переклад)
 *   c/<id>.json    повний текст матеріалу (+ коментарі Reddit) — додаток вантажить, коли відкриваєш
 *   cache.json     пам'ять перекладів, щоб не перекладати те саме двічі
 *
 * Запуск: node scripts/build-feed.mjs <тека-виводу>
 * У GitHub Actions (Update feed) тека виводу — гілка `data`, звідки дані бере додаток.
 *
 * Reddit з серверів GitHub іноді не відповідає. Надійний шлях — безкоштовний ключ Reddit:
 * секрети репозиторію REDDIT_CLIENT_ID і REDDIT_CLIENT_SECRET (див. README).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseHtml, NodeType } from 'node-html-parser';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(DIR, '..', 'data-out');
const DAY = 86400e3;
const NOW = Date.now();
const KEEP_DAYS = { rss: 14, reddit: 7, tg: 4 };
const PER_SOURCE = { rss: 15, reddit: 20, tg: 40 };
const MAX_TRANSLATE = 1500; // рядків за запуск; решта — наступного разу
const MAX_COMMENT_FETCH = 120;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const REDDIT_UA = 'web:infocasting:1.0 (personal RSS reader)';

const sources = JSON.parse(readFileSync(join(DIR, 'sources.json'), 'utf8'));
mkdirSync(join(OUT, 'c'), { recursive: true });
const readJson = (f, def) => {
  try {
    return JSON.parse(readFileSync(join(OUT, f), 'utf8'));
  } catch {
    return def;
  }
};
const prevFeed = readJson('feed.json', { items: [], sources: [] });
const cache = readJson('cache.json', {});

const hash = (s, n = 10) => createHash('sha1').update(s).digest('hex').slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── мережа ─────────────────────────

async function get(url, { timeout = 20000, headers = {}, tries = 2 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', ...headers }, signal: ctl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(String(e?.message)) && !/429/.test(String(e?.message))) break;
      await sleep(1500 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw last;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

// ───────────────────────── текст ─────────────────────────

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', middot: '·', bull: '•' };
export function decode(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const safeCp = (n) => {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
};
const clean = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function latinShare(text) {
  const lat = (String(text).match(/[A-Za-z]/g) || []).length;
  const cyr = (String(text).match(/[Ѐ-ӿ]/g) || []).length;
  return lat + cyr ? lat / (lat + cyr) : 0;
}
const isForeign = (text) => latinShare(text) > 0.6 && /[A-Za-z]{3}/.test(text);

const excerpt = (s, n = 420) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (dot > n * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
};

const absUrl = (u, base) => {
  if (!u) return '';
  try {
    return new URL(decode(u), base).href;
  } catch {
    return '';
  }
};

// ───────────────────────── HTML → блоки ─────────────────────────

const SKIP = new Set(['script', 'style', 'noscript', 'iframe', 'svg', 'form', 'button', 'nav', 'footer', 'header', 'aside', 'select', 'input', 'object', 'embed', 'video', 'audio', 'source', 'template']);
const HEAD = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'ul', 'ol', 'li', 'blockquote', 'pre', 'figure', 'figcaption', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'dl', 'dt', 'dd', 'hr', 'br', 'center', 'details', 'summary', ...HEAD]);
const JUNK = /appeared first on|the post .* appeared|continue reading|read more »|^read more$|^share this|^related posts?:|^advertisement$|subscribe to our newsletter|click here to subscribe|^\[link\]$|^\[comments\]$|submitted by \/u\//i;

/** Блоки: [тип, текст|адреса]. Типи: p — абзац, h — заголовок, li — пункт, q — цитата, pre — код, img — картинка. */
export function htmlToBlocks(html, base) {
  if (!html) return [];
  const root = parseHtml(String(html), { comment: false, blockTextElements: { pre: true } });
  const out = [];
  let buf = '';
  const flush = (type = 'p') => {
    const t = buf.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    buf = '';
    if (!t || JUNK.test(t)) return;
    out.push([type, t]);
  };
  const inline = (node) => {
    if (node.nodeType === NodeType.TEXT_NODE) return decode(node.rawText);
    if (node.nodeType !== NodeType.ELEMENT_NODE) return '';
    const tag = node.rawTagName?.toLowerCase();
    if (SKIP.has(tag)) return '';
    if (tag === 'br') return '\n';
    if (tag === 'img') return '';
    return node.childNodes.map(inline).join('');
  };
  const walk = (node, ctx) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      buf += decode(node.rawText);
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const tag = node.rawTagName?.toLowerCase();
    if (!tag) return node.childNodes.forEach((c) => walk(c, ctx));
    if (SKIP.has(tag)) return;
    if (tag === 'img') {
      const src = absUrl(node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-lazy-src'), base);
      const w = +(node.getAttribute('width') || 0);
      const h = +(node.getAttribute('height') || 0);
      if (!src || /feedburner|pixel|tracking|gravatar|\.gif(\?|$)|emoji|wp-includes\/images|share|badge|1x1|spacer/i.test(src) || (w && w < 80) || (h && h < 60)) return;
      flush();
      out.push(['img', src]);
      return;
    }
    if (tag === 'br') {
      buf += '\n';
      return;
    }
    if (HEAD.has(tag)) {
      flush();
      buf = inline(node);
      flush('h');
      return;
    }
    if (tag === 'li') {
      flush();
      // вкладені картинки в пункті списку — окремо
      node.querySelectorAll('img').forEach(() => {});
      buf = inline(node);
      flush('li');
      return;
    }
    if (tag === 'blockquote') {
      flush();
      const before = out.length;
      node.childNodes.forEach((c) => walk(c, 'q'));
      flush();
      for (let i = before; i < out.length; i++) if (out[i][0] === 'p') out[i][0] = 'q';
      return;
    }
    if (tag === 'pre') {
      flush();
      buf = node.textContent;
      const t = buf.replace(/\s+$/, '');
      buf = '';
      if (t.trim()) out.push(['pre', decode(t)]);
      return;
    }
    if (BLOCK.has(tag)) {
      flush();
      node.childNodes.forEach((c) => walk(c, ctx));
      flush();
      return;
    }
    node.childNodes.forEach((c) => walk(c, ctx));
  };
  walk(root, '');
  flush();
  // склеюємо дублікати картинок і порожнечу
  const res = [];
  for (const b of out) {
    const prev = res[res.length - 1];
    if (prev && prev[0] === b[0] && prev[1] === b[1]) continue;
    res.push(b);
  }
  return res.slice(0, 400);
}

const blocksText = (blocks) => blocks.filter((b) => b[0] !== 'img').map((b) => b[1]).join('\n');
const wordsOf = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

// ───────────────────────── RSS / Atom ─────────────────────────

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', cdataPropName: false, processEntities: true, htmlEntities: true, trimValues: true, parseTagValue: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => {
  if (x == null) return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (Array.isArray(x)) return txt(x[0]);
  return String(x['#text'] ?? x['@href'] ?? '');
};

function feedLink(e) {
  const links = arr(e.link);
  for (const l of links) {
    if (typeof l === 'string') return l;
    if (l?.['@rel'] === 'alternate' || !l?.['@rel']) if (l?.['@href']) return l['@href'];
  }
  return txt(e.guid?.['@isPermaLink'] !== 'false' ? e.guid : '') || txt(e.id) || '';
}

function mediaImage(e) {
  for (const key of ['media:content', 'media:thumbnail', 'media:group']) {
    for (const m of arr(e[key])) {
      if (key === 'media:group') {
        const r = mediaImage(m);
        if (r) return r;
        continue;
      }
      const url = m?.['@url'];
      if (url && (!m['@medium'] || m['@medium'] === 'image') && !/\.(mp4|mp3|webm)(\?|$)/i.test(url)) return url;
    }
  }
  for (const en of arr(e.enclosure)) if (/^image\//.test(en?.['@type'] ?? '') && en['@url']) return en['@url'];
  if (e.image) return txt(e.image.url ?? e.image);
  return '';
}

export function parseFeed(text, src) {
  const doc = xml.parse(text);
  const ch = doc.rss?.channel ?? doc['rdf:RDF']?.channel;
  const entries = doc.rss ? arr(doc.rss.channel?.item) : doc.feed ? arr(doc.feed.entry) : doc['rdf:RDF'] ? arr(doc['rdf:RDF'].item) : [];
  if (!entries.length && !ch && !doc.feed) throw new Error('не RSS');
  const base = feedLink(ch ?? doc.feed ?? {}) || src.url;
  return entries.map((e) => {
    const link = absUrl(feedLink(e), base);
    const html = txt(e['content:encoded']) || txt(e.content) || txt(e.description) || txt(e.summary);
    const blocks = htmlToBlocks(html, link || base);
    const date = Date.parse(txt(e.pubDate) || txt(e.published) || txt(e.updated) || txt(e['dc:date'])) || 0;
    const author = clean(txt(e['dc:creator']) || txt(e.author?.name ?? e.author));
    const img = absUrl(mediaImage(e), link) || blocks.find((b) => b[0] === 'img')?.[1] || '';
    const title = clean(txt(e.title)) || excerpt(blocksText(blocks), 90);
    return { link, title, date, author: author.length < 80 ? author : '', img, blocks };
  });
}

// ───────────────────────── Telegram ─────────────────────────

const TG_ALERT_RE = /(повітрян\S*\s+тривог|відбій\s+(повітряної\s+)?тривог|тривога\s+(в|у|на|по)\s|загроза\s+(застосування\s+)?(балістик|ракет|бпла|авіабомб|каб)|рух\s+(ракет|бпла|шахед)|швидкісн\S*\s+ціл|(шахед|бпла|ракет\S*)\s+(курсом|в напрямку)\s|уваг[аи]!?\s*(балістик|ракет|бпла)|в укриття|🚨|🔴\s*тривог|🟢\s*відбій)/i;
const isAlertPost = (text) => String(text || '').length < 400 && TG_ALERT_RE.test(text);

function tgText(html) {
  return decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseTgPage(html) {
  const out = [];
  const parts = String(html || '').split(/<div class="tgme_widget_message_wrap[^"]*"[^>]*>/).slice(1);
  for (const p of parts) {
    const post = p.match(/data-post="([^"]+)"/);
    if (!post) continue;
    const time = p.match(/<time[^>]*datetime="([^"]+)"/);
    const txtm = p.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const photos = [...p.matchAll(/tgme_widget_message_(?:photo_wrap|video_thumb|link_preview_image)[^>]*background-image:url\('([^']+)'\)/g)].map((m) => m[1]);
    const media = /tgme_widget_message_(photo|video|document|poll|roundvideo)/.test(p);
    const text = txtm ? tgText(txtm[1]) : '';
    const views = p.match(/tgme_widget_message_views">([^<]+)</)?.[1] ?? '';
    const linkPrev = p.match(/<a class="tgme_widget_message_link_preview" href="([^"]+)"/)?.[1] ?? '';
    out.push({ id: post[1], url: 'https://t.me/' + post[1], date: time ? Date.parse(time[1]) : 0, text, photos, media, views, link: decode(linkPrev) });
  }
  return out.filter((x) => x.text || x.photos.length);
}

function tgTitle(text) {
  const first = String(text || '').split('\n').find((l) => l.trim()) || '';
  const t = first.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  const words = t.split(' ');
  return words.length > 14 ? words.slice(0, 14).join(' ') + '…' : t.slice(0, 140);
}

// ───────────────────────── Reddit ─────────────────────────

let redditToken = null;
async function redditAuth() {
  const id = process.env.REDDIT_CLIENT_ID;
  if (!id) return null;
  const secret = process.env.REDDIT_CLIENT_SECRET ?? '';
  const body = secret ? 'grant_type=client_credentials' : `grant_type=${encodeURIComponent('https://oauth.reddit.com/grants/installed_client')}&device_id=${hash(id + 'infocasting', 24)}`;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded', 'user-agent': REDDIT_UA },
    body,
  });
  if (!res.ok) throw new Error(`Reddit OAuth HTTP ${res.status}`);
  return (await res.json()).access_token;
}

let redditMode = null; // 'oauth' | 'json' | 'old' | 'rss'
async function redditJson(path) {
  const tries = redditMode ? [redditMode] : redditToken ? ['oauth', 'json', 'old'] : ['json', 'old'];
  let last;
  for (const mode of tries) {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const url = mode === 'oauth' ? `https://oauth.reddit.com${path}${sep}raw_json=1` : `https://${mode === 'old' ? 'old' : 'www'}.reddit.com${path.replace(/(\?|$)/, '.json$1')}${sep}raw_json=1`;
      const headers = mode === 'oauth' ? { authorization: `Bearer ${redditToken}`, 'user-agent': REDDIT_UA } : { 'user-agent': REDDIT_UA };
      const text = await get(url, { headers, tries: 1 });
      const data = JSON.parse(text);
      redditMode = mode;
      return data;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

function redditPost(d) {
  const permalink = 'https://www.reddit.com' + d.permalink;
  const ext = d.is_self ? '' : d.url_overridden_by_dest || d.url || '';
  let img = d.preview?.images?.[0]?.source?.url ?? '';
  if (!img && d.media_metadata) {
    const first = Object.values(d.media_metadata)[0];
    img = first?.s?.u ?? '';
  }
  if (!img && /\.(jpe?g|png|webp)(\?|$)/i.test(ext)) img = ext;
  if (!img && /^https?:/.test(d.thumbnail ?? '')) img = d.thumbnail;
  const blocks = d.selftext_html ? htmlToBlocks(decode(d.selftext_html), permalink) : [];
  if (d.is_gallery && d.media_metadata) {
    for (const m of Object.values(d.media_metadata).slice(0, 10)) if (m?.s?.u) blocks.push(['img', decode(m.s.u)]);
  } else if (img && !blocks.some((b) => b[0] === 'img') && !d.is_self) blocks.unshift(['img', decode(img)]);
  return {
    rid: d.id,
    link: permalink,
    ext: ext && !ext.includes('reddit.com/r/') && !ext.includes('redd.it') ? ext : '',
    title: decode(d.title),
    date: d.created_utc * 1000,
    author: 'u/' + d.author,
    sub: 'r/' + d.subreddit,
    img: decode(img),
    blocks,
    score: d.score,
    nc: d.num_comments,
    nsfw: d.over_18,
  };
}

function flattenComments(children, depth = 0, out = []) {
  for (const c of children ?? []) {
    if (out.length >= 30) break;
    if (c.kind !== 't1') continue;
    const d = c.data;
    if (!d || d.stickied || d.author === 'AutoModerator' || /^\[(deleted|removed)\]$/.test(d.body)) continue;
    const text = d.body_html ? blocksText(htmlToBlocks(decode(d.body_html), 'https://www.reddit.com')) : d.body;
    if (!text?.trim()) continue;
    out.push({ a: d.author, s: d.score, t: text.slice(0, 3000), d: depth });
    if (depth < 2 && d.replies?.data?.children) flattenComments(d.replies.data.children.slice(0, depth ? 2 : 3), depth + 1, out);
  }
  return out;
}

async function fetchReddit(src) {
  const path = `/r/${src.subs.join('+')}/top?t=day&limit=40`;
  try {
    const data = await redditJson(path);
    return data.data.children.filter((c) => c.kind === 't3').map((c) => redditPost(c.data));
  } catch (e) {
    // запасний шлях — RSS (без рейтингу й коментарів)
    const text = await get(`https://www.reddit.com/r/${src.subs.join('+')}/top/.rss?t=day&limit=40`, { headers: { 'user-agent': REDDIT_UA }, tries: 1 }).catch(() => {
      throw e;
    });
    return parseFeed(text, { url: 'https://www.reddit.com' }).map((x) => ({
      ...x,
      rid: x.link.match(/comments\/([a-z0-9]+)/)?.[1] ?? '',
      sub: x.link.match(/\/r\/([^/]+)/)?.[1] ? 'r/' + x.link.match(/\/r\/([^/]+)/)[1] : '',
      blocks: x.blocks.filter((b) => !/^submitted by|^\[link\]|^\[comments\]/i.test(b[1])),
    }));
  }
}

// ───────────────────────── переклад ─────────────────────────

const SEP = '\n¶¶\n';
async function gtx(text) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uk&dt=t', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': UA },
        body: 'q=' + encodeURIComponent(text),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return (d?.[0] ?? []).map((s) => s?.[0] ?? '').join('');
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1500 * 2 ** i);
    }
  }
}

async function translateAll(texts) {
  const todo = [...new Set(texts.filter((t) => t && !cache[hash(t, 16)]))].slice(0, MAX_TRANSLATE);
  const batches = [];
  let cur = [];
  let len = 0;
  for (const t of todo) {
    if (cur.length && len + t.length + SEP.length > 3500) {
      batches.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(t);
    len += t.length + SEP.length;
  }
  if (cur.length) batches.push(cur);
  let done = 0;
  let failed = 0;
  await pool(batches, 3, async (batch) => {
    try {
      let parts = null;
      if (batch.length > 1) {
        parts = (await gtx(batch.join(SEP))).split(/\s*¶\s*¶\s*/);
        if (parts.length !== batch.length) parts = null;
      }
      if (!parts) parts = await Promise.all(batch.map((t) => gtx(t)));
      batch.forEach((t, i) => {
        if (parts[i]?.trim()) cache[hash(t, 16)] = parts[i].trim();
      });
      done += batch.length;
    } catch {
      failed += batch.length;
    }
  });
  return { done, failed, left: Math.max(0, texts.filter((t) => t && !cache[hash(t, 16)]).length) };
}
const tr = (t) => (t ? cache[hash(t, 16)] : undefined);

// ───────────────────────── збирання ─────────────────────────

async function fetchSource(src) {
  if (src.kind === 'rss') return parseFeed(await get(src.url), src);
  if (src.kind === 'tg') {
    const posts = parseTgPage(await get(`https://t.me/s/${src.handle}`));
    return posts
      .filter((p) => !isAlertPost(p.text))
      .map((p) => {
        const blocks = [...p.text.split(/\n{2,}/).map((t) => ['p', t.trim()]).filter((b) => b[1]), ...p.photos.slice(1).map((u) => ['img', u])];
        return { link: p.url, title: tgTitle(p.text) || src.name, date: p.date, author: src.name, img: p.photos[0] ?? '', blocks, views: p.views, ext: p.link };
      });
  }
  if (src.kind === 'reddit') return fetchReddit(src);
  return [];
}

function toItem(src, raw) {
  const text = blocksText(raw.blocks);
  const w = wordsOf(text);
  const x = excerpt(src.kind === 'tg' ? text.split('\n').slice(1).join(' ') || text : text);
  const lang = isForeign(raw.title + ' ' + x) ? 'en' : 'uk';
  const id = src.kind[0] + hash(raw.link || raw.title);
  const it = { id, s: src.id, k: src.kind, t: raw.title, u: raw.link, d: raw.date || NOW, x, w, l: lang };
  if (raw.author) it.a = raw.author;
  if (raw.img) it.i = raw.img;
  if (raw.ext) it.e = raw.ext;
  if (raw.sub) it.r = raw.sub;
  if (raw.score != null) it.sc = raw.score;
  if (raw.nc != null) it.nc = raw.nc;
  if (raw.rid) it.rid = raw.rid;
  if (raw.views) it.v = raw.views;
  if (raw.nsfw) it.nsfw = 1;
  return { it, blocks: raw.blocks };
}

async function main() {
  const t0 = Date.now();
  try {
    redditToken = await redditAuth();
    if (redditToken) console.log('Reddit: вхід за ключем');
  } catch (e) {
    console.log('Reddit OAuth не вдався:', e.message);
  }

  const prevBySource = new Map();
  for (const it of prevFeed.items ?? []) {
    if (!prevBySource.has(it.s)) prevBySource.set(it.s, []);
    prevBySource.get(it.s).push(it);
  }

  // Reddit — по черзі й з паузами, решта — паралельно
  const reddit = sources.filter((s) => s.kind === 'reddit');
  const other = sources.filter((s) => s.kind !== 'reddit');
  const results = new Map();
  const runOne = async (src) => {
    try {
      const raws = await fetchSource(src);
      const minDate = NOW - KEEP_DAYS[src.kind] * DAY;
      const fresh = raws
        .filter((r) => (r.link || r.title) && (!r.date || r.date >= minDate) && r.date <= NOW + DAY)
        .filter((r) => !r.nsfw)
        .sort((a, b) => (src.kind === 'reddit' ? (b.score ?? 0) - (a.score ?? 0) : b.date - a.date))
        .slice(0, PER_SOURCE[src.kind]);
      results.set(src.id, { ok: true, n: fresh.length, items: fresh.map((r) => toItem(src, r)) });
    } catch (e) {
      results.set(src.id, { ok: false, err: String(e?.message ?? e).slice(0, 120), items: null });
    }
  };
  await Promise.all([
    pool(other, 12, runOne),
    (async () => {
      for (const src of reddit) {
        await runOne(src);
        await sleep(redditMode === 'oauth' ? 700 : 2500);
      }
    })(),
  ]);

  // зведення: якщо джерело не відповіло — лишаємо його попередні матеріали
  const items = [];
  const contents = new Map();
  const status = [];
  for (const src of sources) {
    const r = results.get(src.id);
    const prevStatus = (prevFeed.sources ?? []).find((s) => s.id === src.id);
    if (r?.ok) {
      for (const { it, blocks } of r.items) {
        items.push(it);
        contents.set(it.id, blocks);
      }
      status.push({ id: src.id, ok: 1, n: r.n, at: NOW });
    } else {
      const minDate = NOW - KEEP_DAYS[src.kind] * DAY;
      for (const it of prevBySource.get(src.id) ?? []) if (it.d >= minDate) items.push(it);
      status.push({ id: src.id, ok: 0, err: r?.err ?? 'немає відповіді', at: prevStatus?.at ?? 0 });
    }
  }
  // без дублікатів (той самий матеріал у кількох стрічках)
  const seen = new Set();
  const uniq = items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

  // коментарі Reddit: для найкращих дописів, яких ще немає в кеші
  let commentsFetched = 0;
  if (redditMode && redditMode !== 'rss') {
    const need = uniq
      .filter((it) => it.k === 'reddit' && it.rid && (it.nc ?? 0) > 0)
      .filter((it) => {
        const f = join(OUT, 'c', it.id + '.json');
        if (!existsSync(f)) return true;
        try {
          const c = JSON.parse(readFileSync(f, 'utf8'));
          return !c.cm || NOW - (c.cmAt ?? 0) > 12 * 3600e3;
        } catch {
          return true;
        }
      })
      .sort((a, b) => (b.sc ?? 0) - (a.sc ?? 0))
      .slice(0, MAX_COMMENT_FETCH);
    for (const it of need) {
      try {
        const data = await redditJson(`/comments/${it.rid}?sort=top&limit=25&depth=3`);
        const cm = flattenComments(data?.[1]?.data?.children);
        const blocks = contents.get(it.id) ?? readJson(`c/${it.id}.json`, {}).b ?? [];
        contents.set(it.id, blocks);
        contents.set(it.id + ':cm', cm);
        commentsFetched++;
      } catch {
        break; // Reddit почав відмовляти — продовжимо наступного разу
      }
      await sleep(redditMode === 'oauth' ? 650 : 2200);
    }
  }

  // переклад заголовків і анонсів
  const foreign = uniq.filter((it) => it.l === 'en');
  const trStat = await translateAll(foreign.flatMap((it) => [it.t, it.x]));
  for (const it of foreign) {
    const tt = tr(it.t);
    const tx = tr(it.x);
    if (tt) it.tu = tt;
    if (tx) it.xu = tx;
  }

  // повні тексти: пишемо нові й оновлені, прибираємо застарілі
  const keep = new Set(uniq.map((it) => it.id));
  for (const [key, blocks] of contents) {
    if (key.endsWith(':cm')) continue;
    if (!keep.has(key)) continue;
    const f = join(OUT, 'c', key + '.json');
    const cm = contents.get(key + ':cm');
    const prev = existsSync(f) ? readJson(`c/${key}.json`, {}) : {};
    const next = { b: blocks?.length ? blocks : (prev.b ?? []) };
    if (cm) Object.assign(next, { cm, cmAt: NOW });
    else if (prev.cm) Object.assign(next, { cm: prev.cm, cmAt: prev.cmAt });
    const s = JSON.stringify(next);
    if (!existsSync(f) || readFileSync(f, 'utf8') !== s) writeFileSync(f, s);
  }
  for (const f of readdirSync(join(OUT, 'c'))) if (!keep.has(f.replace(/\.json$/, ''))) rmSync(join(OUT, 'c', f));

  // пам'ять перекладів: лише те, що ще потрібне
  const used = new Set(foreign.flatMap((it) => [it.t, it.x]).filter(Boolean).map((t) => hash(t, 16)));
  for (const k of Object.keys(cache)) if (!used.has(k)) delete cache[k];

  uniq.sort((a, b) => b.d - a.d);
  const feed = {
    v: 1,
    updated: NOW,
    reddit: redditMode ?? 'off',
    sources: status,
    items: uniq,
  };
  writeFileSync(join(OUT, 'feed.json'), JSON.stringify(feed));
  writeFileSync(join(OUT, 'cache.json'), JSON.stringify(cache));
  writeFileSync(join(OUT, 'sources.json'), JSON.stringify(sources));

  const bad = status.filter((s) => !s.ok);
  const by = (k) => uniq.filter((it) => it.k === k).length;
  console.log(`Матеріалів: ${uniq.length} (блоги ${by('rss')}, Telegram ${by('tg')}, Reddit ${by('reddit')})`);
  console.log(`Переклад: нових ${trStat.done}, помилок ${trStat.failed}, на потім ${trStat.left}. Коментарів Reddit: ${commentsFetched}. Reddit: ${redditMode ?? 'недоступний'}`);
  console.log(`Не відповіли ${bad.length} з ${sources.length}:`);
  for (const s of bad) console.log(`  ${sources.find((x) => x.id === s.id)?.name}: ${s.err}`);
  console.log(`Готово за ${Math.round((Date.now() - t0) / 1000)} с`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
