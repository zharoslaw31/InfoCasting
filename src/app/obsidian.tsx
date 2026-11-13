import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, Segmented, Toast } from '../components/ui';
import { useCloud } from '../lib/cloud';
import { goBack } from '../lib/nav';
import { checkBase } from '../lib/obsidian';
import { useStore } from '../lib/store';
import { ObsidianMethod } from '../lib/types';
import { colors, gradients, radius } from '../theme';

/** Сторінка створення токена з уже заповненими назвою, власником і правами (лишається вибрати репозиторії). */
const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?' +
  new URLSearchParams({
    name: 'InfoCasting → BAZA',
    description: 'Збереження статей з InfoCasting у базу Obsidian',
    target_name: 'zharoslaw31',
    expires_in: 'none',
    contents: 'write',
    actions: 'write',
  }).toString();

const open = (u: string) => (Platform.OS === 'web' ? window.open(u, '_blank', 'noopener') : Linking.openURL(u));

export default function ObsidianScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const cloud = useCloud();
  const o = state.settings.obsidian;
  const set = (p: Partial<typeof o>) => dispatch({ type: 'obsidian', obsidian: p });
  const [toast, setToast] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [more, setMore] = useState(o.method !== 'github');
  const [advanced, setAdvanced] = useState(false);
  const connected = o.method === 'github' && !!o.token && o.verified !== false;

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 4000);
  };

  const connect = async () => {
    setChecking(true);
    setCheckMsg(null);
    const r = await checkBase(o);
    setChecking(false);
    if (!r.ok) {
      set({ verified: false });
      setCheckMsg({ ok: false, text: r.error });
      return;
    }
    set({ method: 'github', branch: o.branch || r.branch, verified: true });
    setCheckMsg({
      ok: true,
      text: r.folderExists ? `✓ Базу підключено: ${o.repo} (${r.branch}) → ${o.folder}` : `✓ Доступ є, але теки «${o.folder}» у базі не знайдено — її буде створено з першою нотаткою`,
    });
    showToast('База підключена — можна зберігати');
  };

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) set({ token: t, verified: false });
    } catch {
      showToast('Не вдалося прочитати буфер — вставте вручну');
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
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={[styles.status, connected ? { borderColor: colors.like + '88' } : { borderColor: colors.gold + '88' }]}>
          <Ionicons name={connected ? 'checkmark-circle' : o.method === 'github' ? 'alert-circle' : 'information-circle'} size={22} color={connected ? colors.like : colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {connected ? 'База підключена' : o.method === 'github' ? 'База ще не підключена' : o.method === 'uri' ? 'Зберігаю через Obsidian на пристрої' : 'Зберігаю файлом .md'}
            </Text>
            <Text style={styles.hint}>
              {connected
                ? `${o.repo}${o.branch ? ` · ${o.branch}` : ''} → ${o.folder}. Нотатки одразу потрапляють у базу, Obsidian Git підтягує їх на всі пристрої.`
                : 'Збережене стає нотаткою-джерелом у вашій базі: тема, «Про що це», ваші думки, переклад з оригіналом, коментарі Reddit.'}
            </Text>
          </View>
        </View>

        {/* ── основний спосіб: просто в репозиторій бази ── */}
        <Text style={styles.section}>Підключити базу BAZA</Text>
        <Step n={1} title="Створіть ключ доступу до бази" done={!!o.token}>
          <Text style={styles.hint}>
            Відкриється GitHub з уже заповненою формою. Залишиться в «Repository access» вибрати <Text style={styles.b}>Only select repositories → BAZA</Text> (і InfoCasting — для кнопки «Зібрати зараз») та натиснути <Text style={styles.b}>Generate token</Text>.
          </Text>
          <Pressable onPress={() => open(TOKEN_URL)} style={[styles.pill, { marginTop: 10 }]}>
            <Ionicons name="logo-github" size={16} color={colors.text} />
            <Text style={styles.pillText}>Створити ключ на GitHub</Text>
          </Pressable>
        </Step>
        <Step n={2} title="Вставте ключ сюди" done={!!o.token}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={o.token}
              onChangeText={(token) => set({ token: token.trim(), verified: false })}
              style={[styles.input, { flex: 1, minWidth: 0 }]}
              placeholder="github_pat_…"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.textMuted}
            />
            {Platform.OS === 'web' ? (
              <Pressable onPress={paste} style={styles.pasteBtn} accessibilityLabel="Вставити з буфера">
                <Ionicons name="clipboard-outline" size={20} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
        </Step>
        <Step n={3} title="Перевірте підключення" done={!!connected}>
          <GradientButton
            title={checking ? 'Перевіряю…' : connected ? 'Перевірити ще раз' : 'Перевірити й підключити'}
            icon="link-outline"
            colorsPair={gradients.cooked}
            onPress={checking || !o.token ? undefined : connect}
            style={{ opacity: o.token ? 1 : 0.5 }}
            small
          />
          {checkMsg ? <Text style={[styles.hint, { marginTop: 8, color: checkMsg.ok ? colors.like : colors.nope }]}>{checkMsg.text}</Text> : null}
        </Step>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Ключ на всіх пристроях</Text>
            <Text style={styles.hint}>
              {cloud.email
                ? `Ключ зберігається у вашому акаунті (${cloud.email}) — на іншому телефоні достатньо увійти.`
                : 'Увійдіть в акаунт у Профілі — і ключ буде на всіх ваших пристроях.'}
            </Text>
          </View>
          <Switch value={o.syncToken} onValueChange={(syncToken) => set({ syncToken })} />
        </View>

        <Text style={styles.section}>Як зберігати</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Питати тему й думки</Text>
            <Text style={styles.hint}>Кнопка «В Obsidian» відкриває вікно: назва, тема з ваших «Тем», свої думки, статус. Свайп вгору в Кастингу зберігає одразу.</Text>
          </View>
          <Switch value={o.askBeforeSave} onValueChange={(askBeforeSave) => set({ askBeforeSave })} />
        </View>
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

        <Pressable onPress={() => setAdvanced(!advanced)} style={styles.expander}>
          <Text style={styles.section}>Тека й репозиторій</Text>
          <Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {advanced ? (
          <>
            <Text style={styles.label}>Тека в базі</Text>
            <TextInput value={o.folder} onChangeText={(folder) => set({ folder })} style={styles.input} placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Репозиторій бази</Text>
            <TextInput value={o.repo} onChangeText={(repo) => set({ repo: repo.trim(), verified: false })} style={styles.input} autoCapitalize="none" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Гілка (порожньо — основна)</Text>
            <TextInput value={o.branch} onChangeText={(branch) => set({ branch: branch.trim() })} style={styles.input} placeholder="master" autoCapitalize="none" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Назва сховища в Obsidian</Text>
            <TextInput value={o.vault} onChangeText={(vault) => set({ vault })} style={styles.input} placeholder="BAZA" placeholderTextColor={colors.textMuted} />
            <Text style={styles.hint}>Для кнопки «Відкрити в Obsidian» після збереження.</Text>
          </>
        ) : null}

        <Pressable onPress={() => setMore(!more)} style={styles.expander}>
          <Text style={styles.section}>Інші способи</Text>
          <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {more ? (
          <>
            <Segmented<ObsidianMethod>
              compact
              value={o.method}
              onChange={(method) => set({ method })}
              options={[
                { value: 'github', label: 'База (GitHub)' },
                { value: 'uri', label: 'Obsidian тут' },
                { value: 'file', label: 'Файл .md' },
              ]}
            />
            <Text style={[styles.hint, { marginTop: 8 }]}>
              {o.method === 'uri'
                ? 'Відкриється Obsidian на цьому пристрої й створить нотатку у сховищі з назвою вище. Працює, лише якщо Obsidian встановлено тут.'
                : o.method === 'file'
                  ? 'Завантажиться .md-файл — перетягніть його в теку бази.'
                  : 'Рекомендовано: нотатка одразу в базі, з будь-якого пристрою.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
      {toast ? <Toast text={toast} bottom={insets.bottom + 30} /> : null}
    </View>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepN, done && { backgroundColor: colors.like + '33', borderColor: colors.like }]}>
        {done ? <Ionicons name="checkmark" size={14} color={colors.like} /> : <Text style={styles.stepNText}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <View style={{ marginTop: 6 }}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 22, fontWeight: '900' },
  status: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1 },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  section: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 8 },
  step: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stepN: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  stepNText: { color: colors.textDim, fontWeight: '900', fontSize: 13 },
  b: { color: colors.text, fontWeight: '800' },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  input: { color: colors.text, fontSize: 15, height: 46, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, outlineStyle: 'none' } as object,
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  pasteBtn: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  expander: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
