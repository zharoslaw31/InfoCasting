import { useCallback, useState } from 'react';
import { loadContent, useFeed } from './feed';
import { buildNote, saveToObsidian } from './obsidian';
import { needsTranslation, translateContent, Translated } from './reader';
import { useHaptics, useStore } from './store';
import { Content, Item } from './types';

/** Зберегти матеріал в Obsidian: повний текст + переклад + коментарі. */
export function useSaveToObsidian() {
  const { state, dispatch } = useStore();
  const { sourceOf } = useFeed();
  const haptic = useHaptics();
  const [busy, setBusy] = useState<string | null>(null);

  const save = useCallback(
    async (it: Item, pre?: { content?: Content | null; tr?: Translated | null }): Promise<{ ok: boolean; text: string }> => {
      setBusy(it.id);
      try {
        let content = pre?.content ?? null;
        if (!content) content = await loadContent(it.id).catch(() => null);
        let tr = pre?.tr ?? null;
        if (!tr && content && state.settings.translate && needsTranslation(content, it)) tr = await translateContent(it, content).catch(() => null);
        const { title, md } = buildNote(it, sourceOf(it.s), content, tr, state.settings.obsidian);
        const r = await saveToObsidian(state.settings.obsidian, title, md);
        if (!r.ok) {
          haptic('warning');
          return { ok: false, text: r.error };
        }
        dispatch({ type: 'add', item: it, list: 'saved', path: r.path });
        haptic('success');
        return { ok: true, text: `Збережено ${r.how}: ${title}` };
      } finally {
        setBusy(null);
      }
    },
    [state.settings.obsidian, state.settings.translate, sourceOf, dispatch, haptic],
  );

  return { save, busy };
}
