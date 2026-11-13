import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemRow } from '../../components/ItemRow';
import { Segmented, Toast } from '../../components/ui';
import { timeAgo, useFeed } from '../../lib/feed';
import { openArticle } from '../../lib/nav';
import { ListName, useStore } from '../../lib/store';
import { LibraryEntry } from '../../lib/types';
import { useSaveToObsidian } from '../../lib/useSave';
import { colors, radius, TAB_BAR_HEIGHT } from '../../theme';

const NOTE: Record<ListName, string> = { liked: 'відкладено', saved: 'в Obsidian', read: 'прочитано', skipped: 'пропущено' };
const EMPTY: Record<ListName, [string, string]> = {
  liked: ['🔖', 'Тут будуть матеріали, які ви відклали на потім: свайп вправо в Кастингу або закладка в Стрічці.'],
  saved: ['💎', 'Тут — усе, що ви зберегли в Obsidian: свайп вгору або кнопка «В Obsidian».'],
  read: ['📖', 'Тут — усе, що ви відкривали.'],
  skipped: ['🙈', 'Тут — пропущене в Кастингу. Можна повернути, якщо передумали.'],
};

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch, isLiked, isSaved, readIds } = useStore();
  const { sourceOf } = useFeed();
  const { saveOrAsk, busy } = useSaveToObsidian();
  const [list, setList] = useState<ListName>('liked');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const tr = state.settings.translate;

  const data = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('uk');
    const all: LibraryEntry[] = state[list];
    if (!needle) return all;
    return all.filter((e) => `${e.item.t} ${e.item.tu ?? ''} ${e.item.x} ${sourceOf(e.item.s)?.name ?? ''}`.toLocaleLowerCase('uk').includes(needle));
  }, [state, list, q, sourceOf]);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3200);
  };

  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 20;
  const unreadLiked = state.liked.filter((e) => !readIds.has(e.id)).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Бібліотека</Text>
        <Text style={styles.sub}>{unreadLiked ? `${unreadLiked} відкладених ще не прочитано` : 'Ваші закладки й збережене'}</Text>
      </View>
      <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
        <Segmented
          compact
          value={list}
          onChange={setList}
          options={[
            { value: 'liked', label: 'Прочитати', count: state.liked.length },
            { value: 'saved', label: 'Obsidian', count: state.saved.length },
            { value: 'read', label: 'Прочитане', count: state.read.length },
            { value: 'skipped', label: 'Пропущене', count: state.skipped.length },
          ]}
        />
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Пошук у бібліотеці" placeholderTextColor={colors.textMuted} style={styles.input} />
      </View>
      {(list === 'read' || list === 'skipped') && state[list].length ? (
        <Pressable
          onPress={() => state[list].forEach((e) => dispatch({ type: 'remove', id: e.id, list }))}
          style={{ alignSelf: 'flex-end', paddingHorizontal: 18, paddingTop: 8 }}
        >
          <Text style={{ color: colors.nope, fontWeight: '800', fontSize: 13 }}>Очистити список</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        renderItem={({ item: e }) => (
          <View>
            <ItemRow
              it={e.item}
              src={sourceOf(e.item.s)}
              translate={tr}
              read={list === 'liked' && readIds.has(e.id)}
              liked={isLiked(e.id)}
              saved={isSaved(e.id)}
              saving={busy === e.id}
              note={`${NOTE[list]} ${timeAgo(e.at)}`}
              onOpen={() => openArticle(e.id)}
              onLike={() => (isLiked(e.id) ? dispatch({ type: 'remove', id: e.id, list: 'liked' }) : dispatch({ type: 'add', item: e.item, list: 'liked' }))}
              onSave={() => saveOrAsk(e.item).then((r) => r && showToast((r.ok ? '✓ ' : '⚠️ ') + r.text))}
            />
            {list === 'saved' && e.path ? <Text style={styles.path}>📁 {e.path}</Text> : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>{EMPTY[list][0]}</Text>
            <Text style={styles.emptyText}>{q ? 'Нічого не знайдено' : EMPTY[list][1]}</Text>
          </View>
        }
      />
      {toast ? <Toast text={toast} bottom={bottomPad} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 10, paddingHorizontal: 14, height: 42, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: 15, height: '100%', outlineStyle: 'none' } as object,
  path: { color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, paddingBottom: 8, marginTop: -4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: colors.textDim, fontSize: 15, marginTop: 10, textAlign: 'center', lineHeight: 21 },
});
