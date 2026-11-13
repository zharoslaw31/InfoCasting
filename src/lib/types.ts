export type Kind = 'rss' | 'tg' | 'reddit';
export type Area = 'work' | 'res' | 'sense' | 'news';

export type Source = {
  id: string;
  kind: Kind;
  name: string;
  group: string;
  area: Area;
  /** тема бази Obsidian (тег), напр. покликання/маркетинг */
  topic?: string;
  url?: string;
  handle?: string;
  subs?: string[];
};

export type SourceStatus = { id: string; ok: 0 | 1; n?: number; err?: string; at: number };

/** Матеріал зі стрічки (поля скорочені, бо стрічка велика). */
export type Item = {
  id: string;
  /** id джерела */
  s: string;
  k: Kind;
  /** заголовок мовою оригіналу */
  t: string;
  /** заголовок українською (якщо оригінал англійською) */
  tu?: string;
  /** посилання на оригінал */
  u: string;
  /** зовнішнє посилання (Reddit-допис з посиланням, прев'ю в Telegram) */
  e?: string;
  /** дата, мс */
  d: number;
  a?: string;
  i?: string;
  /** анонс */
  x: string;
  xu?: string;
  /** слів у повному тексті */
  w: number;
  l: 'en' | 'uk';
  /** сабреддіт */
  r?: string;
  sc?: number;
  nc?: number;
  rid?: string;
  /** перегляди в Telegram */
  v?: string;
};

export type Feed = {
  v: number;
  updated: number;
  reddit: string;
  sources: SourceStatus[];
  items: Item[];
};

export type Block = [type: 'p' | 'h' | 'li' | 'q' | 'pre' | 'img', value: string];
export type Comment = { a: string; s: number; t: string; d: number };
export type Content = { b: Block[]; cm?: Comment[] };

/** Свайп: like — прочитаю, nope — пропустити, save — одразу в Obsidian. */
export type SwipeKind = 'like' | 'nope' | 'save';

export type LibraryEntry = { id: string; at: number; item: Item; path?: string };

export type ObsidianMethod = 'github' | 'uri' | 'file';

export type Settings = {
  haptics: boolean;
  onboarded?: boolean;
  castingMode?: 'all' | 'foryou';
  castingKinds?: Kind[];
  /** показувати переклад (true) чи оригінал */
  translate: boolean;
  /** вимкнені джерела */
  mutedSources: string[];
  /** вимкнені групи */
  mutedGroups: string[];
  obsidian: {
    method: ObsidianMethod;
    vault: string;
    folder: string;
    repo: string;
    branch: string;
    token: string;
    /** зберігати оригінал у згорнутій виносці під перекладом */
    withOriginal: boolean;
    /** скільки коментарів Reddit зберігати */
    comments: number;
    /** зберігати токен в акаунті, щоб база працювала на всіх пристроях */
    syncToken: boolean;
    /** перевірено: репозиторій і доступ працюють */
    verified?: boolean;
    /** питати тему й думки перед збереженням (крім свайпу вгору) */
    askBeforeSave: boolean;
  };
};

export type Profile = { name: string; avatar: string; createdAt: number };
