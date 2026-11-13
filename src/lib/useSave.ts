import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { loadContent, useFeed } from './feed';
import { buildNote, NoteExtra, saveToObsidian } from './obsidian';
import { needsTranslation, translateContent, Translated } from './reader';
import { useHaptics, useStore } from './store';
import { Content, Item } from './types';

/** Чи налаштовано збереження (для GitHub потрібен токен). */
export function useObsidianReady() {
  const { state } = useStore();
  const o = state.settings.obsidian;
  return o.method !== 'github' || !!o.token.trim();
}

/** Зберегти матеріал в Obsidian: повний текст + переклад + коментарі. */
export function useSaveToObsidian() {
  const { state, dispatch } = useStore();
  const { sourceOf } = useFeed();
  const haptic = useHaptics();
  const [busy, setBusy] = useState<string | null>(null);
  const o = state.settings.obsidian;

  const save = useCallback(
    async (it: Item, pre?: { content?: Content | null; tr?: Translated | null; extra?: NoteExtra }): Promise<{ ok: boolean; text: string; path?: string }> => {
      if (o.method === 'github' && !o.token.trim()) {
        router.push('/obsidian');
        return { ok: false, text: 'Спершу підключіть базу Obsidian' };
      }
      setBusy(it.id);
      try {
        let content = pre?.content ?? null;
        if (!content) content = await loadContent(it.id).catch(() => null);
        let tr = pre?.tr ?? null;
        if (!tr && content && state.settings.translate && needsTranslation(content, it)) tr = await translateContent(it, content).catch(() => null);
        const { title, md } = buildNote(it, sourceOf(it.s), content, tr, o, pre?.extra);
        const r = await saveToObsidian(o, title, md);
        if (!r.ok) {
          haptic('warning');
          return { ok: false, text: r.error };
        }
        dispatch({ type: 'add', item: it, list: 'saved', path: r.path });
        haptic('success');
        return { ok: true, text: `Збережено ${r.how}: ${title}`, path: r.path };
      } finally {
        setBusy(null);
      }
    },
    [o, state.settings.translate, sourceOf, dispatch, haptic],
  );

  /** Кнопка «В Obsidian»: вікно з темою й думками або одразу, якщо так налаштовано. */
  const saveOrAsk = useCallback(
    async (it: Item, pre?: { content?: Content | null; tr?: Translated | null }) => {
      if (o.method === 'github' && !o.token.trim()) {
        router.push('/obsidian');
        return null;
      }
      if (o.askBeforeSave) {
        router.push(`/save/${it.id}` as never);
        return null;
      }
      return save(it, pre);
    },
    [o, save],
  );

  return { save, saveOrAsk, busy };
}
