/**
 * Збирає список джерел InfoCasting (scripts/sources.json) зі списків бази Obsidian:
 *   scripts/baza/blogs.opml    ← BAZA/9 Система/9.4 Стрічки/BAZE-блоги.opml
 *   scripts/baza/reddit.opml   ← BAZA/9 Система/9.4 Стрічки/BAZE-reddit.opml
 *   scripts/baza/telegram.md   ← BAZA/1 Карти/1.3 Каталоги/Телеграм.md
 *
 * Оновили списки в Obsidian — скопіюйте файли сюди й запустіть `node scripts/import-baza.mjs`.
 * Або редагуйте scripts/sources.json напряму.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(DIR, 'baza', f), 'utf8');
const sid = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : '';
};

const AREA = { '💼': 'work', '🔋': 'res', '❤️': 'sense' };
const areaOf = (group) => AREA[[...group][0]] ?? AREA[group.slice(0, 2)] ?? 'news';

/** Тема бази (тег) для груп Reddit — у OPML Reddit категорій немає. */
const REDDIT_TOPIC = {
  'Маркетинг і бренд': 'покликання/маркетинг',
  'Інтернет-маркетинг і SEO': 'покликання/інтернет-маркетинг',
  'SMM і контент': 'покликання/smm',
  'B2B і продажі': 'покликання/b2b',
  'Галузь: меблі й верстати': 'покликання/галузь',
  "Менеджмент і кар'єра": 'покликання/менеджмент',
  'ШІ': 'покликання/ші',
  'Вебдизайн і UX': 'покликання/вебдизайн',
  "Здоров'я і сон": 'ресурс/здоровя',
  'Харчування і кухня': 'ресурс/харчування',
  'Спорт': 'ресурс/спорт',
  'Психіка': 'ресурс/психіка',
  'Мислення': 'ресурс/мислення',
  'Фінанси': 'ресурс/фінанси',
  'Порядок': 'ресурс/гігієна',
  "Сім'я і стосунки": 'сенс/дружина',
  'Люди': 'сенс/люди',
  'Хобі: ігри': 'сенс/хобі/настолки',
  'Хобі: руками й на природі': 'сенс/хобі',
  'Хобі: гітара': 'сенс/хобі/гітара',
  'Хобі: вайбкодинг': 'сенс/хобі/вайбкодинг',
  'Культура': 'сенс/культура',
  'Світогляд': 'сенс/світогляд',
  'Наука': 'сенс/наука',
  'Україна й подорожі': 'сенс/подорожі',
};

/** Групи Telegram → напрямок і тема. */
const TG_GROUP = {
  'Новини': { area: 'news', group: '🇺🇦 Новини' },
  'Офіційне': { area: 'news', group: '🇺🇦 Офіційне' },
  'Робота і бізнес': { area: 'work', group: '💼 Робота і бізнес', topic: 'покликання/маркетинг' },
  'Технології й ШІ': { area: 'work', group: '💼 Технології й ШІ', topic: 'покликання/ші' },
  'Фінанси': { area: 'res', group: '🔋 Фінанси', topic: 'ресурс/фінанси' },
  'Наука й культура': { area: 'sense', group: '❤️ Наука й культура', topic: 'сенс/культура' },
};

const stripEmoji = (g) => g.replace(/^[^\p{L}]+/u, '').trim();

function parseOpml(xml) {
  const out = [];
  let group = '';
  for (const m of xml.matchAll(/<outline\b[^>]*>/g)) {
    const tag = m[0];
    const url = attr(tag, 'xmlUrl');
    if (!url) {
      group = attr(tag, 'text') || attr(tag, 'title');
      continue;
    }
    out.push({ name: attr(tag, 'text') || attr(tag, 'title'), url, group, category: attr(tag, 'category').replace(/^\//, ''), html: attr(tag, 'htmlUrl') });
  }
  return out;
}

const sources = [];

for (const f of parseOpml(read('blogs.opml'))) {
  sources.push({ id: 'b' + sid(f.url), kind: 'rss', name: f.name, url: f.url, group: f.group, area: areaOf(f.group), topic: f.category || undefined });
}

// Reddit: один запит на групу (мультиреддіт r/a+b+c), так Reddit не блокує
const redditGroups = new Map();
for (const f of parseOpml(read('reddit.opml'))) {
  const sub = f.url.match(/\/r\/([^/]+)/)?.[1];
  if (!sub) continue;
  if (!redditGroups.has(f.group)) redditGroups.set(f.group, []);
  redditGroups.get(f.group).push(sub);
}
for (const [group, subs] of redditGroups) {
  sources.push({ id: 'r' + sid(group), kind: 'reddit', name: 'Reddit: ' + stripEmoji(group), subs, group, area: areaOf(group), topic: REDDIT_TOPIC[stripEmoji(group)] });
}

let tgGroup = '';
for (const line of read('telegram.md').split('\n')) {
  const h = line.match(/^##\s+(.+?)\s*$/);
  if (h) {
    tgGroup = h[1];
    continue;
  }
  const m = line.match(/^\s*[-*]\s+(?:@|https?:\/\/t\.me\/(?:s\/)?)([A-Za-z0-9_]{4,})\/?\s*(.*)$/);
  if (!m || tgGroup.startsWith('Як ')) continue;
  const g = TG_GROUP[tgGroup] ?? { area: 'news', group: '✈️ ' + tgGroup };
  sources.push({ id: 't' + sid(m[1].toLowerCase()), kind: 'tg', name: m[2].trim() || '@' + m[1], handle: m[1], group: g.group, area: g.area, topic: g.topic });
}

writeFileSync(join(DIR, 'sources.json'), JSON.stringify(sources, null, 1) + '\n');
const count = (k) => sources.filter((s) => s.kind === k).length;
console.log(`Джерел: ${sources.length} (блоги ${count('rss')}, Reddit-груп ${count('reddit')} = ${[...redditGroups.values()].flat().length} сабреддітів, Telegram ${count('tg')})`);
