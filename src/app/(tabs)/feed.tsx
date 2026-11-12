import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemRow } from '../../components/ItemRow';
import { Chip, Segmented, Toast } from '../../components/ui';
import { AREA, AREAS, timeAgo, useFeed } from '../../lib/feed';
import { openArticle } from '../../lib/nav';
import { useStore } from '../../lib/store';
import { Area, Item, Kind } from '../../lib/types';
import { useSaveToObsidian } from '../../lib/useSave';
import { colors, radius, TAB_BAR_HEIGHT } from '../../theme';

type KindFilter = 'all' | Kind;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { feed, sourceOf, sources, loading, refresh, error } = useFeed();
  const { state, dispatch, isLiked, isSaved, readIds } = useStore();
  const { save, busy } = useSaveToObsidian();
  const [kind, setKind] = useState<KindFilter>('all');
  const [area, setArea] = useState<Area | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const tr = state.settings.translate;

  const muted = useMemo(() => new Set([...state.settings.mutedSources, ...state.settings.mutedGroups]), [state.settings.mutedSources, state.settings.mutedGroups]);
  const base = useMemo(
    () =>
      (feed?.items ?? []).filter((it) => {
        const s = sourceOf(it.s);
        return !muted.has(it.s) && !(s && muted.has(s.group));
      }),
    [feed, muted, sourceOf],
  );

  const counts = useMemo(() => {
    const c = { all: 0, rss: 0, tg: 0, reddit: 0 };
    for (const it of base) {
      if (unread && readIds.has(it.id)) continue;
      c.all++;
      c[it.k]++;
    }
    return c;
  }, [base, unread, readIds]);

  const groups = useMemo(() => {
    if (!area) return [];
    const g = new Map<string, number>();
    for (const s of sources) if (s.area === area && (kind === 'all' || s.kind === kind) && !muted.has(s.group)) g.set(s.group, 0);
    for (const it of base) {
      const s = sourceOf(it.s);
      if (s && g.has(s.group) && (kind === 'all' || it.k === kind)) g.set(s.group, (g.get(s.group) ?? 0) + 1);
    }
    return [...g.entries()].filter(([, n]) => n > 0);
  }, [area, kind, sources, base, sourceOf, muted]);

  const groupSources = useMemo(() => {
    if (!group) return [];
    const n = new Map<string, number>();
    for (const it of base) if (sourceOf(it.s)?.group === group && (kind === 'all' || it.k === kind)) n.set(it.s, (n.get(it.s) ?? 0) + 1);
    return [...n.entries()].map(([id, c]) => ({ id, name: sourceOf(id)?.name ?? id, c })).sort((a, b) => b.c - a.c);
  }, [group, base, kind, sourceOf]);

  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('uk');
    return base.filter((it) => {
      if (kind !== 'all' && it.k !== kind) return false;
      if (unread && readIds.has(it.id)) return false;
      const s = sourceOf(it.s);
      if (area && s?.area !== area) return false;
      if (group && s?.group !== group) return false;
      if (src && it.s !== src) return false;
      if (needle) {
        const hay = `${it.t} ${it.tu ?? ''} ${it.x} ${it.xu ?? ''} ${s?.name ?? ''} ${it.r ?? ''}`.toLocaleLowerCase('uk');
        if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [base, kind, unread, readIds, area, group, src, q, sourceOf]);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3200);
  };

  const renderItem = useCallback(
    ({ item: it }: { item: Item }) => (
      <ItemRow
        it={it}
        src={sourceOf(it.s)}
        translate={tr}
        read={readIds.has(it.id)}
        liked={isLiked(it.id)}
        saved={isSaved(it.id)}
        saving={busy === it.id}
        onOpen={() => openArticle(it.id)}
        onLike={() => (isLiked(it.id) ? dispatch({ type: 'remove', id: it.id, list: 'liked' }) : dispatch({ type: 'add', item: it, list: 'liked' }))}
        onSave={() => save(it).then((r) => showToast((r.ok ? '✓ ' : '⚠️ ') + r.text))}
      />
    ),
    [sourceOf, tr, readIds, isLiked, isSaved, busy, dispatch, save],
  );

  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 20;
  const failed = feed?.sources.filter((s) => !s.ok).length ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Стрічка</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {feed ? `оновлено ${timeAgo(feed.updated)}${failed ? ` · ${failed} джерел мовчать` : ''}` : loading ? 'Завантаження…' : (error ?? '')}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={tr ? 'Показувати оригінал' : 'Показувати переклад'}
          onPress={() => dispatch({ type: 'settings', settings: { translate: !tr } })}
          style={[styles.iconBtn, tr && { borderColor: colors.gold + '88' }]}
        >
          <Text style={{ color: tr ? colors.gold : colors.textDim, fontWeight: '900', fontSize: 13 }}>{tr ? 'UA' : 'EN'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Джерела" onPress={() => router.push('/sources')} style={styles.iconBtn}>
          <Ionicons name="options-outline" size={21} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Пошук у стрічці" placeholderTextColor={colors.textMuted} style={styles.input} returnKeyType="search" />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 14, marginTop: 10 }}>
        <Segmented
          compact
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSrc(null);
          }}
          options={[
            { value: 'all', label: 'Усе', count: counts.all },
            { value: 'rss', label: 'Блоги', count: counts.rss },
            { value: 'tg', label: 'Telegram', count: counts.tg },
            { value: 'reddit', label: 'Reddit', count: counts.reddit },
          ]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: 14 }}>
        <Chip label="Непрочитане" icon="●" active={unread} onPress={() => setUnread(!unread)} />
        {AREAS.map((a) => (
          <Chip
            key={a}
            label={AREA[a].label}
            icon={AREA[a].emoji}
            active={area === a}
            onPress={() => {
              setArea(area === a ? null : a);
              setGroup(null);
              setSrc(null);
            }}
          />
        ))}
      </ScrollView>
      {groups.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 14 }}>
          {groups.map(([g, n]) => (
            <Chip
              key={g}
              label={`${g.replace(/^[^\p{L}]+/u, '')} ${n}`}
              active={group === g}
              onPress={() => {
                setGroup(group === g ? null : g);
                setSrc(null);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {groupSources.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 14 }}>
          {groupSources.map((s) => (
            <Chip key={s.id} label={`${s.name} ${s.c}`} active={src === s.id} onPress={() => setSrc(src === s.id ? null : s.id)} />
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        refreshControl={<RefreshControl refreshing={loading && !!feed} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          items.length ? (
            <View style={styles.listHead}>
              <Text style={styles.count}>{items.length} матеріалів</Text>
              {items.some((it) => !readIds.has(it.id)) ? (
                <Pressable onPress={() => dispatch({ type: 'markRead', items })} hitSlop={6}>
                  <Text style={styles.markAll}>✓ Позначити все прочитаним</Text>
                </Pressable>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>{feed ? '🗞️' : '📡'}</Text>
            <Text style={styles.emptyText}>{feed ? (unread ? 'Усе прочитано!' : 'Нічого не знайдено') : loading ? 'Завантажуємо стрічку…' : (error ?? 'Немає даних')}</Text>
          </View>
        }
      />
      {toast ? <Toast text={toast} bottom={bottomPad} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 12, paddingHorizontal: 14, height: 44, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: 15, height: '100%', outlineStyle: 'none' } as object,
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  count: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  markAll: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: colors.textDim, fontSize: 15, marginTop: 10, textAlign: 'center' },
});
