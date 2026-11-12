import { Platform, Share } from 'react-native';
import { Item } from './types';

export async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  const full = url ? `${text}\n${url}` : text;
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return 'shared';
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'shared';
      }
    }
    try {
      await nav?.clipboard?.writeText(full);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: full });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Поділитись матеріалом: заголовок українською + посилання на оригінал. */
export function shareItem(it: Item) {
  const title = it.tu ?? it.t;
  return shareText(title, title, it.u);
}

/** Сторінка оригіналу, перекладена Google Translate. */
export const translatedPageUrl = (url: string) => `https://translate.google.com/translate?sl=auto&tl=uk&u=${encodeURIComponent(url)}`;
