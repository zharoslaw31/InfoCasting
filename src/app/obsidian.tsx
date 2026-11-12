import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, Segmented, Toast } from '../components/ui';
import { goBack } from '../lib/nav';
import { useStore } from '../lib/store';
import { ObsidianMethod } from '../lib/types';
import { colors, radius } from '../theme';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export default function ObsidianScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const o = state.settings.obsidian;
  const set = (p: Partial<typeof o>) => dispatch({ type: 'obsidian', obsidian: p });
  const [toast, setToast] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 4000);
  };

  const check = async () => {
    setChecking(true);
    try {
      const r = await fetch(`https://api.github.com/repos/${o.repo}`, { headers: { authorization: `Bearer ${o.token.trim()}`, accept: 'application/vnd.github+json' } });
      if (!r.ok) return showToast(r.status === 404 ? 'Репозиторій не знайдено або токен не має до нього доступу' : `GitHub: HTTP ${r.status}`);
      const d = (await r.json()) as { permissions?: { push?: boolean }; default_branch?: string };
      showToast(d.permissions?.push === false ? 'Токен бачить базу, але не може писати (потрібно Contents: Read and write)' : `✓ Усе гаразд: збереження йтимуть у ${o.repo}${d.default_branch ? ` (${o.branch || d.default_branch})` : ''}`);
    } catch {
      showToast('Немає зʼєднання з GitHub');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>💎 Obsidian</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Text style={styles.p}>
          Збережене стає нотаткою-джерелом у вашій базі — як кнопка «📚 У Джерела»: тема з джерела, «Про що це», «3 ключові думки», «Матеріал» з перекладом і оригіналом у згорнутій виносці, коментарі Reddit.
        </Text>

        <Text style={styles.label}>Як зберігати</Text>
        <Segmented<ObsidianMethod>
          compact
          value={o.method}
          onChange={(method) => set({ method })}
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'uri', label: 'Obsidian' },
            { value: 'file', label: 'Файл .md' },
          ]}
        />
        <Text style={[styles.hint, { marginTop: 8 }]}>
          {o.method === 'github'
            ? 'Найзручніше: нотатка комітиться одразу в репозиторій бази, а Obsidian Git підтягне її на всі пристрої. Працює з телефона без відкриття Obsidian.'
            : o.method === 'uri'
              ? 'Відкриється Obsidian на цьому пристрої й створить нотатку. Довгі нотатки передаються через буфер обміну.'
              : 'Завантажиться .md-файл — перетягніть його в теку бази.'}
        </Text>

        <Text style={styles.label}>Тека в базі</Text>
        <TextInput value={o.folder} onChangeText={(folder) => set({ folder })} style={styles.input} placeholderTextColor={colors.textMuted} />

        {o.method === 'uri' ? (
          <>
            <Text style={styles.label}>Назва сховища (vault)</Text>
            <TextInput value={o.vault} onChangeText={(vault) => set({ vault })} style={styles.input} placeholder="BAZA" placeholderTextColor={colors.textMuted} />
          </>
        ) : null}

        {o.method === 'github' ? (
          <>
            <Text style={styles.label}>Репозиторій бази</Text>
            <TextInput value={o.repo} onChangeText={(repo) => set({ repo: repo.trim() })} style={styles.input} placeholder="zharoslaw31/BAZA" autoCapitalize="none" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Гілка (порожньо — основна)</Text>
            <TextInput value={o.branch} onChangeText={(branch) => set({ branch: branch.trim() })} style={styles.input} placeholder="main" autoCapitalize="none" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Токен GitHub</Text>
            <TextInput
              value={o.token}
              onChangeText={(token) => set({ token: token.trim() })}
              style={styles.input}
              placeholder="github_pat_…"
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.hint}>
              Створіть токен:{' '}
              <Text style={{ color: colors.accent }} onPress={() => (Platform.OS === 'web' ? window.open(TOKEN_URL, '_blank') : Linking.openURL(TOKEN_URL))}>
                github.com → Fine-grained token
              </Text>
              {'\n'}Repository access → Only select repositories → BAZA (і InfoCasting, щоб працювала кнопка «Зібрати зараз»). Permissions → Contents: Read and write (+ Actions: Read and write для InfoCasting). Токен зберігається лише на цьому пристрої.
            </Text>
            <Pressable onPress={check} disabled={checking || !o.token} style={[styles.pill, { marginTop: 12, opacity: o.token ? 1 : 0.5 }]}>
              <Text style={styles.pillText}>{checking ? 'Перевіряю…' : 'Перевірити доступ'}</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Оригінал під перекладом</Text>
            <Text style={styles.hint}>Англійський текст у згорнутій виносці «Оригінал»</Text>
          </View>
          <Switch value={o.withOriginal} onValueChange={(withOriginal) => set({ withOriginal })} />
        </View>

        <Text style={styles.label}>Коментарів Reddit у нотатці</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[0, 5, 10, 15, 30].map((n) => (
            <Chip key={n} label={n ? String(n) : 'Без коментарів'} active={o.comments === n} onPress={() => set({ comments: n })} />
          ))}
        </View>
      </ScrollView>
      {toast ? <Toast text={toast} bottom={insets.bottom + 30} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 22, fontWeight: '900' },
  p: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  input: { color: colors.text, fontSize: 15, height: 46, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, outlineStyle: 'none' } as object,
  pill: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent + '88', backgroundColor: colors.card },
  pillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
});
