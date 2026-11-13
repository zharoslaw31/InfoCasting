import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GhostButton, GradientButton, Segmented } from '../../components/ui';
import { useFeed } from '../../lib/feed';
import { goBack } from '../../lib/nav';
import { defaultTitle, NoteStatus, obsidianOpenUrl } from '../../lib/obsidian';
import { useArticle } from '../../lib/reader';
import { useStore } from '../../lib/store';
import TOPICS from '../../lib/topics.json';
import { Item } from '../../lib/types';
import { useSaveToObsidian } from '../../lib/useSave';
import { colors, gradients, radius } from '../../theme';

const DIRS: { key: string; label: string }[] = [
  { key: 'покликання', label: '💼 Покликання' },
  { key: 'ресурс', label: '🔋 Ресурс' },
  { key: 'сенс', label: '❤️ Сенс' },
];

const openUrl = (u: string) => (Platform.OS === 'web' ? (window.location.href = u) : Linking.openURL(u));

export default function SaveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { byId, sourceOf } = useFeed();
  const { state, isSaved } = useStore();
  const o = state.settings.obsidian;
  const it: Item | undefined = useMemo(
    () => byId(id) ?? [...state.liked, ...state.saved, ...state.read, ...state.skipped].find((e) => e.id === id)?.item,
    [id, byId, state.liked, state.saved, state.read, state.skipped],
  );
  const src = it ? sourceOf(it.s) : undefined;
  const { content, tr, loading, translating } = useArticle(it, state.settings.translate);
  const { save, busy } = useSaveToObsidian();

  const [title, setTitle] = useState(() => (it ? defaultTitle(it) : ''));
  const [topic, setTopic] = useState<string | null>(src?.topic ?? null);
  const [dir, setDir] = useState(() => (src?.topic ?? 'покликання').split('/')[0]);
  const [thoughts, setThoughts] = useState('');
  const [status, setStatus] = useState<NoteStatus>(state.read.some((e) => e.id === id) ? 'прочитано' : 'хочу');
  const [result, setResult] = useState<{ ok: boolean; text: string; path?: string; open?: string } | null>(null);

  if (!it) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.muted}>Матеріал не знайдено</Text>
        <GhostButton title="Назад" onPress={goBack} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const topics = TOPICS.filter((t) => t.tag.startsWith(dir + '/'));
  const doSave = async () => {
    const r = await save(it, { content, tr, extra: { title, topic, thoughts, status } });
    setResult(r);
  };
  const wasSaved = isSaved(it.id);
  const preparing = loading || translating;

  if (result?.ok) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: 22, alignItems: 'center' }]}>
        <Text style={{ fontSize: 56 }}>💎</Text>
        <Text style={styles.doneTitle}>{result.open ? 'Нотатка готова' : 'Збережено в базу'}</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>{result.path}</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 12 }]}>
          {result.open
            ? 'Натисніть кнопку нижче — Obsidian відкриється і створить нотатку.'
            : o.method === 'github'
            ? 'Нотатка вже в репозиторії бази. Obsidian підтягне її, коли відкриєте базу (Obsidian Git), або натисніть «Pull» вручну.'
            : 'Нотатку передано в Obsidian.'}
        </Text>
        <View style={{ width: '100%', maxWidth: 420, marginTop: 24, gap: 10 }}>
          <GradientButton
            title={result.open ? 'Створити нотатку в Obsidian' : 'Відкрити в Obsidian'}
            icon="open-outline"
            colorsPair={gradients.cooked}
            onPress={() => openUrl(result.open ?? obsidianOpenUrl(o.vault, result.path ?? ''))}
          />
          <GhostButton title="Готово" icon="checkmark" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Закрити">
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>💎 В Obsidian</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 120, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text style={styles.dest}>
          📁 {o.method === 'github' ? o.repo.split('/')[1] ?? o.repo : o.vault} → {o.folder}
          {wasSaved ? '  ·  уже зберігали — буде нова нотатка' : ''}
        </Text>

        <Text style={styles.label}>Назва нотатки</Text>
        <TextInput value={title} onChangeText={setTitle} style={[styles.input, { minHeight: 72 }]} placeholderTextColor={colors.textMuted} multiline />

        <Text style={styles.label}>Тема</Text>
        <Segmented compact value={dir} onChange={setDir} options={DIRS.map((d) => ({ value: d.key, label: d.label }))} />
        <View style={styles.wrap}>
          <Chip label="Без теми" active={!topic} onPress={() => setTopic(null)} />
          {topics.map((t) => (
            <Chip key={t.tag} label={(t.sub ? '↳ ' : '') + t.tag.split('/').slice(1).join('/')} active={topic === t.tag} onPress={() => setTopic(t.tag)} />
          ))}
        </View>
        {topic ? (
          <Text style={styles.hint}>
            #{topic} · {TOPICS.find((t) => t.tag === topic)?.hint ?? ''}
          </Text>
        ) : null}

        <Text style={styles.label}>Мої думки</Text>
        <TextInput
          value={thoughts}
          onChangeText={setThoughts}
          style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
          multiline
          placeholder={'Що зачепило? Кожен рядок — окремий пункт\n«3 ключових думок»'}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Статус</Text>
        <Segmented<NoteStatus>
          compact
          value={status}
          onChange={setStatus}
          options={[
            { value: 'хочу', label: 'Хочу прочитати' },
            { value: 'читаю', label: 'Читаю' },
            { value: 'прочитано', label: 'Прочитано' },
          ]}
        />

        <Text style={[styles.hint, { marginTop: 18 }]}>
          У нотатці: {it.l === 'en' ? 'переклад українською, оригінал у згорнутій виносці, ' : 'повний текст, '}
          {it.k === 'reddit' ? `${o.comments} найкращих коментарів, ` : ''}посилання на джерело, «Що з цього виросло».
        </Text>
        {result && !result.ok ? <Text style={[styles.hint, { color: colors.nope, marginTop: 10 }]}>{result.text}</Text> : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {preparing ? (
          <View style={styles.prep}>
            <ActivityIndicator size="small" color={colors.gold} />
            <Text style={styles.hint}>{translating ? 'Перекладаю текст для нотатки…' : 'Завантажую текст…'}</Text>
          </View>
        ) : null}
        <GradientButton
          title={busy === it.id ? 'Зберігаю…' : 'Зберегти в базу'}
          icon="diamond-outline"
          colorsPair={gradients.cooked}
          onPress={busy || preparing ? undefined : doSave}
          style={{ opacity: busy || preparing ? 0.6 : 1 }}
        />
        <Pressable onPress={() => router.push('/obsidian')} style={{ alignSelf: 'center', marginTop: 10 }} hitSlop={6}>
          <Text style={styles.link}>Налаштування збереження</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 22, fontWeight: '900' },
  dest: { color: colors.cooked, fontSize: 13, fontWeight: '800' },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  input: { color: colors.text, fontSize: 15, lineHeight: 21, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, outlineStyle: 'none' } as object,
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  muted: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  link: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: 'rgba(18,22,33,0.97)', borderTopWidth: 1, borderTopColor: colors.border },
  prep: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 },
  doneTitle: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 10 },
});
