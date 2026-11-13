import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Segmented } from '../components/ui';
import { AREA, AREAS, KIND, plural, timeAgo, useFeed } from '../lib/feed';
import { goBack } from '../lib/nav';
import { useStore } from '../lib/store';
import { Kind, Source } from '../lib/types';
import { colors, radius } from '../theme';

export default function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const { sources, feed } = useFeed();
  const { state, dispatch } = useStore();
  const [kind, setKind] = useState<Kind>('rss');
  const [open, setOpen] = useState<string | null>(null);
  const mutedSrc = new Set(state.settings.mutedSources);
  const mutedGrp = new Set(state.settings.mutedGroups);
  const status = useMemo(() => new Map((feed?.sources ?? []).map((s) => [s.id, s])), [feed]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of feed?.items ?? []) m.set(it.s, (m.get(it.s) ?? 0) + 1);
    return m;
  }, [feed]);

  const groups = useMemo(() => {
    const g = new Map<string, Source[]>();
    for (const a of AREAS)
      for (const s of sources)
        if (s.kind === kind && s.area === a) {
          if (!g.has(s.group)) g.set(s.group, []);
          g.get(s.group)!.push(s);
        }
    return [...g.entries()];
  }, [sources, kind]);

  const toggleGroup = (g: string) =>
    dispatch({ type: 'settings', settings: { mutedGroups: mutedGrp.has(g) ? state.settings.mutedGroups.filter((x) => x !== g) : [...state.settings.mutedGroups, g] } });
  const toggleSrc = (id: string) =>
    dispatch({ type: 'settings', settings: { mutedSources: mutedSrc.has(id) ? state.settings.mutedSources.filter((x) => x !== id) : [...state.settings.mutedSources, id] } });

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Джерела</Text>
      </View>
      <View style={{ paddingHorizontal: 14 }}>
        <Segmented
          compact
          value={kind}
          onChange={setKind}
          options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k].label, count: sources.filter((s) => s.kind === k).length }))}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Text style={styles.hint}>
          {kind === 'reddit'
            ? 'Сабреддіти зведені в групи — так, як у вашій базі. Вимкніть зайве, і воно зникне з Кастингу й Стрічки.'
            : kind === 'tg'
              ? 'Пости-оповіщення про тривоги, відбої й загрози ховаються самі.'
              : 'Список узято з вашої бази Obsidian (BAZE-блоги.opml). Вимкніть зайве, і воно зникне з Кастингу й Стрічки.'}
        </Text>
        {mutedSrc.size + mutedGrp.size ? (
          <Pressable
            onPress={() => dispatch({ type: 'settings', settings: { mutedSources: [], mutedGroups: [] } })}
            style={styles.resetBtn}
          >
            <Ionicons name="refresh" size={16} color={colors.accent} />
            <Text style={styles.resetText}>Увімкнути все ({mutedSrc.size + mutedGrp.size} вимкнено)</Text>
          </Pressable>
        ) : null}
        {groups.map(([g, list]) => {
          const gOff = mutedGrp.has(g);
          const isOpen = open === g;
          const n = list.reduce((a, s) => a + (counts.get(s.id) ?? 0), 0);
          const area = AREA[list[0].area];
          return (
            <View key={g} style={styles.group}>
              <Pressable onPress={() => setOpen(isOpen ? null : g)} style={styles.groupHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.groupTitle, gOff && { color: colors.textMuted }]}>{/^\p{L}/u.test(g) ? `${area.emoji} ${g}` : g}</Text>
                  <Text style={styles.sub}>
                    {list.length} {kind === 'reddit' ? `${plural(list.length, ['група', 'групи', 'груп'])} · ${list.flatMap((s) => s.subs ?? []).length} r/` : plural(list.length, ['джерело', 'джерела', 'джерел'])} · {n} {plural(n, ['свіжий', 'свіжі', 'свіжих'])}
                    {list[0].topic ? ` · #${list[0].topic}` : ''}
                  </Text>
                </View>
                <Switch value={!gOff} onValueChange={() => toggleGroup(g)} />
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              {isOpen
                ? list.map((s) => {
                    const st = status.get(s.id);
                    return (
                      <View key={s.id} style={styles.src}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.srcName, (gOff || mutedSrc.has(s.id)) && { color: colors.textMuted }]}>{s.name}</Text>
                          <Text style={[styles.sub, st && !st.ok && { color: colors.nope }]} numberOfLines={2}>
                            {s.kind === 'reddit' ? (s.subs ?? []).map((x) => 'r/' + x).join(', ') + '\n' : s.kind === 'tg' ? `@${s.handle} · ` : ''}
                            {!st ? 'ще не збирали' : st.ok ? `${counts.get(s.id) ?? 0} свіжих` : `не відповідає${st.at ? ` (востаннє ${timeAgo(st.at)})` : ''}: ${st.err}`}
                          </Text>
                        </View>
                        <Switch value={!mutedSrc.has(s.id)} disabled={gOff} onValueChange={() => toggleSrc(s.id)} />
                      </View>
                    );
                  })
                : null}
            </View>
          );
        })}
        <Text style={[styles.hint, { marginTop: 16 }]}>
          Додати чи прибрати джерело для всіх пристроїв: допишіть його в списки бази (BAZE-блоги.opml, BAZE-reddit.opml, нотатка «Телеграм») і запустіть scripts/import-baza.mjs, або відредагуйте scripts/sources.json у репозиторії InfoCasting.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 22, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  group: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 17 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent + '66', marginBottom: 12 },
  resetText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  srcName: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
