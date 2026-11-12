import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDeck, SwipeDeckHandle } from '../../components/SwipeDeck';
import { GradientButton, RoundButton, Toast } from '../../components/ui';
import { buildTaste, interleave, plural, tasteScore, useFeed } from '../../lib/feed';
import { openArticle } from '../../lib/nav';
import { useHaptics, useStore } from '../../lib/store';
import { Item, Kind, SwipeKind } from '../../lib/types';
import { useSaveToObsidian } from '../../lib/useSave';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

const ALL_KINDS: Kind[] = ['rss', 'tg', 'reddit'];

export default function CastingScreen() {
  const insets = useSafeAreaInsets();
  const { state, seen, dispatch } = useStore();
  const { feed, sourceOf, loading, error, refresh } = useFeed();
  const { save } = useSaveToObsidian();
  const haptic = useHaptics();
  const deck = useRef<SwipeDeckHandle>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const [shuffleTick, setShuffleTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const showToast = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3200);
  }, []);

  const mode = state.settings.castingMode ?? 'all';
  const forYou = mode === 'foryou';
  const kinds = state.settings.castingKinds?.length ? state.settings.castingKinds : ALL_KINDS;
  const muted = useMemo(() => new Set([...state.settings.mutedSources, ...state.settings.mutedGroups]), [state.settings.mutedSources, state.settings.mutedGroups]);

  const pool = useMemo(
    () =>
      (feed?.items ?? []).filter((it) => {
        if (!kinds.includes(it.k)) return false;
        const s = sourceOf(it.s);
        return !muted.has(it.s) && !(s && muted.has(s.group));
      }),
    [feed, kinds, muted, sourceOf],
  );

  const deckKey = `${feed?.updated}|${kinds.join()}|${mode}|${shuffleTick}|${muted.size}`;

  useEffect(() => {
    if (!state.ready || !feed) return;
    const fresh = pool.filter((it) => !seenRef.current.has(it.id));
    if (forYou) {
      const taste = buildTaste(
        state.liked.map((e) => e.item),
        state.saved.map((e) => e.item),
        state.skipped.map((e) => e.item),
        sourceOf,
      );
      setQueue(
        fresh
          .map((it) => ({ it, s: tasteScore(it, taste, sourceOf) + Math.random() * 1.2 }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.it),
      );
    } else if (shuffleTick) {
      setQueue(interleave(fresh).sort(() => Math.random() - 0.5));
    } else setQueue(interleave(fresh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey, state.ready]);

  const lastSwiped = useRef<Item[]>([]);
  const handleSwipe = useCallback(
    (it: Item, kind: SwipeKind) => {
      lastSwiped.current = [it, ...lastSwiped.current].slice(0, 30);
      dispatch({ type: 'swipe', item: it, kind });
      setQueue((q) => q.filter((x) => x.id !== it.id));
      if (kind === 'save') {
        showToast('Зберігаю в Obsidian…');
        save(it).then((r) => {
          showToast(r.ok ? '✓ ' + r.text : '⚠️ ' + r.text + ' — додали в «Прочитати»');
          if (!r.ok) dispatch({ type: 'add', item: it, list: 'liked' });
        });
      } else haptic(kind === 'like' ? 'success' : 'light');
    },
    [dispatch, haptic, save, showToast],
  );

  const undo = () => {
    const it = lastSwiped.current.shift();
    if (!it) return;
    dispatch({ type: 'undo' });
    haptic('warning');
    setQueue((q) => [it, ...q.filter((x) => x.id !== it.id)]);
  };

  // клавіатура на комп'ютері: ← пропустити, → прочитаю, ↑ в Obsidian, Backspace — скасувати
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!location.pathname.replace(/\/+$/, '').endsWith('/InfoCasting') && location.pathname !== '/') return;
      if (e.key === 'ArrowRight') deck.current?.swipe('like');
      else if (e.key === 'ArrowLeft') deck.current?.swipe('nope');
      else if (e.key === 'ArrowUp') deck.current?.swipe('save');
      else if (e.key === 'Backspace') undoRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleKind = (k: Kind) => {
    const cur = state.settings.castingKinds?.length ? state.settings.castingKinds : ALL_KINDS;
    let next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    if (!next.length) next = [k];
    dispatch({ type: 'settings', settings: { castingKinds: next.length === ALL_KINDS.length ? [] : next } });
  };

  const { width } = useWindowDimensions();
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;
  const left = queue.length;
  const allKinds = kinds.length === ALL_KINDS.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.logo, width < 380 && { fontSize: 22 }]}>
            Info<Text style={{ color: colors.accent }}>Casting</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {!feed ? (loading ? 'Завантажуємо стрічку…' : ' ') : `${left} ${plural(left, ['матеріал', 'матеріали', 'матеріалів'])} у колоді`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityLabel="Перемішати"
            onPress={() => {
              haptic('light');
              setShuffleTick((t) => t + 1);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="shuffle" size={22} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel="Джерела" onPress={() => router.push('/sources')} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="options-outline" size={22} color={colors.text} />
            {muted.size ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{muted.size}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modes} contentContainerStyle={styles.modesRow}>
        <ModeChip icon="🎲" label="Усе" active={!forYou} onPress={() => dispatch({ type: 'settings', settings: { castingMode: 'all' } })} />
        <ModeChip icon="✨" label="Для тебе" active={forYou} onPress={() => dispatch({ type: 'settings', settings: { castingMode: 'foryou' } })} />
        <View style={styles.modeSep} />
        <ModeChip icon="📰" label="Блоги" active={kinds.includes('rss')} soft={allKinds} onPress={() => toggleKind('rss')} />
        <ModeChip icon="✈️" label="Telegram" active={kinds.includes('tg')} soft={allKinds} onPress={() => toggleKind('tg')} />
        <ModeChip icon="👽" label="Reddit" active={kinds.includes('reddit')} soft={allKinds} onPress={() => toggleKind('reddit')} />
        <View style={styles.modeSep} />
        <ModeChip icon="☕" label="Що почитати?" onPress={() => router.push('/pick')} />
      </ScrollView>
      {forYou && state.liked.length + state.saved.length < 3 ? (
        <Text style={styles.forYouHint}>Відкладіть або збережіть хоча б 3 матеріали — і підбір врахує ваші улюблені джерела й теми.</Text>
      ) : null}

      <View style={{ flex: 1, marginTop: 10 }}>
        {queue.length ? (
          <SwipeDeck ref={deck} movies={queue} onSwipe={handleSwipe} onOpen={(it) => openArticle(it.id)} />
        ) : !feed && loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.emptyText, { marginTop: 14 }]}>Збираємо статті, пости й обговорення…</Text>
          </View>
        ) : state.ready ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{feed ? '🎉' : '📡'}</Text>
            <Text style={styles.emptyTitle}>{feed ? (pool.length ? 'Ви переглянули все свіже' : 'Нічого не знайдено') : 'Стрічка недоступна'}</Text>
            <Text style={styles.emptyText}>
              {!feed
                ? (error ?? 'Перевірте інтернет')
                : pool.length
                  ? 'Нові матеріали з’являються кожні пів години. А поки — загляньте в Стрічку чи Бібліотеку.'
                  : 'Усі джерела цього типу вимкнені. Увімкніть їх у налаштуваннях джерел.'}
            </Text>
            <GradientButton title="Оновити" icon="refresh" onPress={refresh} style={{ marginTop: 20 }} />
          </View>
        ) : null}
      </View>

      {state.ready && !state.settings.onboarded && queue.length ? (
        <Pressable style={styles.tipWrap} onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Як це працює</Text>
            <TipRow icon="arrow-forward" color={colors.like} text="Свайп вправо — прочитаю пізніше, піде в Бібліотеку" />
            <TipRow icon="arrow-back" color={colors.nope} text="Свайп вліво — пропустити" />
            <TipRow icon="arrow-up" color={colors.cooked} text="Свайп вгору — одразу в Obsidian, з перекладом і коментарями" />
            <TipRow icon="language-outline" color={colors.gold} text="Англійське перекладається українською само; оригінал — одним дотиком" />
            <TipRow icon="information-circle-outline" color={colors.textDim} text="Тап по картці — повний текст" />
            <GradientButton title="Зрозуміло" icon="checkmark" onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })} style={{ marginTop: 16 }} />
          </View>
        </Pressable>
      ) : null}

      {toast ? <Toast text={toast} bottom={bottomPad + 80} /> : null}

      <View style={[styles.actions, { paddingBottom: bottomPad }]}>
        <RoundButton icon="arrow-undo" size={48} color={colors.gold} onPress={undo} disabled={!lastSwiped.current.length} />
        <RoundButton icon="close" size={66} color={colors.nope} onPress={() => deck.current?.swipe('nope')} disabled={!queue.length} iconSize={34} />
        <RoundButton icon="diamond-outline" size={52} color={colors.cooked} onPress={() => deck.current?.swipe('save')} disabled={!queue.length} iconSize={22} />
        <RoundButton icon="bookmark" size={66} color={colors.like} filled={gradients.brand} onPress={() => deck.current?.swipe('like')} disabled={!queue.length} iconSize={30} />
      </View>
    </View>
  );
}

function ModeChip({ icon, label, active, soft, onPress }: { icon: string; label: string; active?: boolean; soft?: boolean; onPress: () => void }) {
  const filled = active && !soft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [styles.modeChip, filled && styles.modeChipActive, active && soft && styles.modeChipSoft, pressed && { opacity: 0.75 }]}
    >
      {filled ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      <Text style={styles.modeIcon}>{icon}</Text>
      <Text style={[styles.modeText, active && { color: filled ? '#fff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function TipRow({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipIcon, { backgroundColor: color + '26' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexGrow: 0, marginTop: 12 },
  modesRow: { paddingHorizontal: 14, gap: 8 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modeChipActive: { borderColor: 'transparent' },
  modeChipSoft: { borderColor: colors.accent + 'AA', backgroundColor: colors.accent + '1A' },
  modeSep: { width: 1, height: 22, backgroundColor: colors.border, alignSelf: 'center', marginHorizontal: 2 },
  modeIcon: { fontSize: 15 },
  modeText: { color: colors.textDim, fontSize: 14, fontWeight: '800' },
  forYouHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 20, marginTop: 8 },
  tipWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,10,0.72)', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 30 },
  tip: { width: '100%', maxWidth: 420, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.border },
  tipTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 16 },
  empty: { flex: 1, marginHorizontal: 14, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
});
