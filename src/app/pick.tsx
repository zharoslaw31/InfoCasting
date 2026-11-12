import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemRow } from '../components/ItemRow';
import { Chip, GradientButton, SectionTitle } from '../components/ui';
import { AREA, AREAS, buildTaste, readMinutes, tasteScore, useFeed } from '../lib/feed';
import { goBack, openArticle } from '../lib/nav';
import { useStore } from '../lib/store';
import { Area, Item } from '../lib/types';
import { colors } from '../theme';

type Time = 3 | 10 | 20 | 60;
type What = 'any' | 'long' | 'talk' | 'news';
const TIMES: { v: Time; label: string }[] = [
  { v: 3, label: '⚡ 3 хв' },
  { v: 10, label: '☕ 10 хв' },
  { v: 20, label: '🛋 20 хв' },
  { v: 60, label: '📖 Довге читання' },
];
const WHAT: { v: What; label: string; icon: string }[] = [
  { v: 'any', label: 'Будь-що', icon: '🎲' },
  { v: 'long', label: 'Стаття', icon: '📰' },
  { v: 'talk', label: 'Обговорення', icon: '👽' },
  { v: 'news', label: 'Новини', icon: '✈️' },
];

export default function PickScreen() {
  const insets = useSafeAreaInsets();
  const { feed, sourceOf } = useFeed();
  const { state, readIds, isLiked, dispatch } = useStore();
  const [area, setArea] = useState<Area | null>(null);
  const [time, setTime] = useState<Time>(10);
  const [what, setWhat] = useState<What>('any');
  const [seed, setSeed] = useState(0);

  const picks = useMemo(() => {
    const taste = buildTaste(
      state.liked.map((e) => e.item),
      state.saved.map((e) => e.item),
      state.skipped.map((e) => e.item),
      sourceOf,
    );
    const muted = new Set([...state.settings.mutedSources, ...state.settings.mutedGroups]);
    const fits = (it: Item) => {
      const s = sourceOf(it.s);
      if (muted.has(it.s) || (s && muted.has(s.group))) return false;
      if (readIds.has(it.id) || state.skipped.some((e) => e.id === it.id)) return false;
      if (area && s?.area !== area) return false;
      if (what === 'long' && it.k !== 'rss') return false;
      if (what === 'talk' && it.k !== 'reddit') return false;
      if (what === 'news' && it.k !== 'tg') return false;
      const m = readMinutes(it) + (it.k === 'reddit' ? Math.min(8, (it.nc ?? 0) / 40) : 0);
      if (time === 3) return m <= 4;
      if (time === 10) return m >= 2 && m <= 12;
      if (time === 20) return m >= 6 && m <= 25;
      return m >= 12;
    };
    return (feed?.items ?? [])
      .filter(fits)
      .map((it) => ({ it, s: tasteScore(it, taste, sourceOf) + Math.random() * 2 + (it.w > 300 ? 0.5 : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, area, time, what, seed]);

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>☕ Що почитати?</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <SectionTitle>Про що</SectionTitle>
        <View style={styles.wrap}>
          <Chip label="Усе" icon="🌐" active={!area} onPress={() => setArea(null)} />
          {AREAS.map((a) => (
            <Chip key={a} label={AREA[a].label} icon={AREA[a].emoji} active={area === a} onPress={() => setArea(a)} />
          ))}
        </View>
        <SectionTitle>Скільки є часу</SectionTitle>
        <View style={styles.wrap}>
          {TIMES.map((t) => (
            <Chip key={t.v} label={t.label} active={time === t.v} onPress={() => setTime(t.v)} />
          ))}
        </View>
        <SectionTitle>Що саме</SectionTitle>
        <View style={styles.wrap}>
          {WHAT.map((w) => (
            <Chip key={w.v} label={w.label} icon={w.icon} active={what === w.v} onPress={() => setWhat(w.v)} />
          ))}
        </View>

        <SectionTitle right={<Chip label="Інші" icon="🔄" onPress={() => setSeed(seed + 1)} />}>Для вас зараз</SectionTitle>
        {picks.length ? (
          <>
            <View style={styles.list}>
              {picks.map((it) => (
                <ItemRow
                  key={it.id}
                  it={it}
                  src={sourceOf(it.s)}
                  translate={state.settings.translate}
                  liked={isLiked(it.id)}
                  onOpen={() => openArticle(it.id)}
                  onLike={() => (isLiked(it.id) ? dispatch({ type: 'remove', id: it.id, list: 'liked' }) : dispatch({ type: 'add', item: it, list: 'liked' }))}
                />
              ))}
            </View>
            <GradientButton title="Обери за мене" icon="sparkles" onPress={() => openArticle(picks[Math.floor(Math.random() * picks.length)].id)} style={{ marginTop: 18 }} />
          </>
        ) : (
          <Text style={styles.empty}>Під ці умови нічого непрочитаного немає. Спробуйте інший час чи тему.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 22, fontWeight: '900' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  list: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  empty: { color: colors.textDim, fontSize: 15, lineHeight: 21 },
});
