import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionTitle, Toast } from '../../components/ui';
import { KIND, plural, timeAgo, useFeed } from '../../lib/feed';
import { triggerFeedUpdate } from '../../lib/obsidian';
import { useStore } from '../../lib/store';
import { Kind } from '../../lib/types';
import { colors, radius, TAB_BAR_HEIGHT } from '../../theme';

const AVATARS = ['🧠', '📚', '🦉', '🧐', '☕', '🚀', '🎯', '🌿'];
const METHOD_LABEL = { github: 'у репозиторій бази (GitHub)', uri: 'через Obsidian на пристрої', file: 'файлом .md' };

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const { feed, sources, refresh } = useFeed();
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const s = state.settings;

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3500);
  };

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400e3;
    const byKind: Record<Kind, number> = { rss: 0, tg: 0, reddit: 0 };
    let weekRead = 0;
    for (const e of state.read) {
      byKind[e.item.k]++;
      if (e.at >= week) weekRead++;
    }
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      const from = d.getTime();
      const to = from + 86400e3;
      return { label: d.toLocaleDateString('uk-UA', { weekday: 'short' }), n: state.read.filter((e) => e.at >= from && e.at < to).length };
    });
    const srcCount = new Map<string, number>();
    for (const e of [...state.read, ...state.saved]) srcCount.set(e.item.s, (srcCount.get(e.item.s) ?? 0) + 1);
    const top = [...srcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { byKind, weekRead, days, top };
  }, [state.read, state.saved]);

  const maxDay = Math.max(1, ...stats.days.map((d) => d.n));
  const bad = feed?.sources.filter((x) => !x.ok) ?? [];
  const nameOf = (id: string) => sources.find((x) => x.id === id)?.name ?? id;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 40, paddingHorizontal: 18, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={styles.head}>
          <Pressable
            onPress={() => dispatch({ type: 'profile', profile: { avatar: AVATARS[(AVATARS.indexOf(state.profile.avatar) + 1) % AVATARS.length] } })}
            style={styles.avatar}
          >
            <Text style={{ fontSize: 34 }}>{state.profile.avatar}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput value={state.profile.name} onChangeText={(name) => dispatch({ type: 'profile', profile: { name } })} style={styles.name} maxLength={30} />
            <Text style={styles.sub}>
              {stats.weekRead} {plural(stats.weekRead, ['матеріал', 'матеріали', 'матеріалів'])} за тиждень · {state.saved.length} в Obsidian
            </Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <Tile n={state.read.length} label="прочитано" color={colors.accent} />
          <Tile n={state.liked.length} label="відкладено" color={colors.like} />
          <Tile n={state.saved.length} label="в Obsidian" color={colors.cooked} />
        </View>

        <SectionTitle>Активність за тиждень</SectionTitle>
        <View style={styles.card}>
          <View style={styles.bars}>
            {stats.days.map((d, i) => (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barN}>{d.n || ''}</Text>
                <View style={[styles.bar, { height: 6 + (d.n / maxDay) * 70 }, d.n ? { backgroundColor: colors.accent } : null]} />
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.sub, { marginTop: 12 }]}>
            {(Object.keys(KIND) as Kind[]).map((k) => `${KIND[k].emoji} ${KIND[k].label}: ${stats.byKind[k]}`).join('   ')}
          </Text>
          {stats.top.length ? <Text style={[styles.sub, { marginTop: 6 }]}>Найчастіше: {stats.top.map(([id, n]) => `${nameOf(id)} (${n})`).join(', ')}</Text> : null}
        </View>

        <SectionTitle>Налаштування</SectionTitle>
        <View style={styles.card}>
          <Row icon="language-outline" title="Перекладати українською" sub="Англійські статті, пости й коментарі" right={<Switch value={s.translate} onValueChange={(v) => dispatch({ type: 'settings', settings: { translate: v } })} />} />
          <Row
            icon="diamond-outline"
            title="Obsidian"
            sub={`Зберігати ${METHOD_LABEL[s.obsidian.method]} · ${s.obsidian.folder}`}
            onPress={() => router.push('/obsidian')}
          />
          <Row
            icon="albums-outline"
            title="Джерела"
            sub={`${sources.length} джерел · вимкнено ${s.mutedSources.length + s.mutedGroups.length}`}
            onPress={() => router.push('/sources')}
          />
          {Platform.OS !== 'web' ? (
            <Row icon="phone-portrait-outline" title="Вібрація" right={<Switch value={s.haptics} onValueChange={(v) => dispatch({ type: 'settings', settings: { haptics: v } })} />} />
          ) : null}
        </View>

        <SectionTitle>Стрічка</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.p}>
            {feed
              ? `Оновлено ${timeAgo(feed.updated)}: ${feed.items.length} матеріалів. Нові збираються самі кожні 30 хвилин.`
              : 'Стрічка ще не завантажилась.'}
          </Text>
          {feed && feed.reddit !== 'oauth' ? (
            <Text style={[styles.p, { color: colors.gold, marginTop: 8 }]}>
              Reddit без ключа віддає серверу лише кілька груп за раз, тому дописи оновлюються повільніше, а коментарі вантажаться з вашого пристрою. Як підключити безкоштовний ключ Reddit — у README репозиторію.
            </Text>
          ) : null}
          {bad.length ? (
            <Text style={[styles.sub, { marginTop: 8 }]}>
              Не відповіли ({bad.length}): {bad.slice(0, 12).map((x) => nameOf(x.id)).join(', ')}
              {bad.length > 12 ? '…' : ''}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Pressable onPress={() => refresh().then(() => showToast('Стрічку перезавантажено'))} style={styles.pill}>
              <Text style={styles.pillText}>↻ Перезавантажити</Text>
            </Pressable>
            {s.obsidian.token ? (
              <Pressable
                onPress={() =>
                  triggerFeedUpdate(s.obsidian.token)
                    .then((ok) => showToast(ok ? 'Збирання запущено — свіже буде за 3–4 хвилини' : 'Токен не має доступу до Actions репозиторію InfoCasting'))
                    .catch(() => showToast('Не вдалося запустити'))
                }
                style={styles.pill}
              >
                <Text style={styles.pillText}>⚡ Зібрати зараз</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <SectionTitle>Встановити на телефон</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.p}>iPhone (Safari): «Поділитися» → «На початковий екран».</Text>
          <Text style={[styles.p, { marginTop: 6 }]}>Android (Chrome): меню ⋮ → «Додати на головний екран».</Text>
        </View>

        <SectionTitle>Дані</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.sub}>Бібліотека й налаштування зберігаються лише на цьому пристрої.</Text>
          <Pressable
            onPress={() => {
              if (!confirmReset) return setConfirmReset(true);
              dispatch({ type: 'resetLibrary' });
              setConfirmReset(false);
              showToast('Бібліотеку очищено');
            }}
            style={[styles.pill, { marginTop: 12, borderColor: colors.nope + '88', alignSelf: 'flex-start' }]}
          >
            <Text style={[styles.pillText, { color: colors.nope }]}>{confirmReset ? 'Точно очистити все?' : 'Очистити бібліотеку'}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {toast ? <Toast text={toast} bottom={TAB_BAR_HEIGHT + insets.bottom + 30} /> : null}
    </View>
  );
}

function Tile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileN, { color }]}>{n}</Text>
      <Text style={styles.tileL}>{label}</Text>
    </View>
  );
}

function Row({ icon, title, sub, right, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 24, fontWeight: '900', padding: 0, outlineStyle: 'none' } as object,
  sub: { color: colors.textMuted, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  tile: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' },
  tileN: { fontSize: 26, fontWeight: '900' },
  tileL: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110 },
  barCol: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 6, backgroundColor: colors.border },
  barN: { color: colors.textDim, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  barLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  p: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
});
