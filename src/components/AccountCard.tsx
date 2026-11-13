import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useCloud } from '../lib/cloud';
import { useStore } from '../lib/store';
import { colors, radius } from '../theme';
import { GradientButton, Segmented } from './ui';

type Mode = 'in' | 'up' | 'reset';

/** Вхід / реєстрація / відновлення пароля і стан синхронізації бібліотеки з хмарою. */
export function AccountCard() {
  const cloud = useCloud();
  const { state } = useStore();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  if (!cloud.enabled) {
    return (
      <View style={styles.card}>
        <Row icon="cloud-offline-outline" color={colors.gold} title="Хмарний акаунт ще не підключено" />
        <Text style={styles.muted}>Поки що бібліотека зберігається лише на цьому пристрої.</Text>
      </View>
    );
  }

  if (cloud.email) {
    const when = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
    const statusText =
      cloud.status === 'syncing' ? 'Синхронізація…' : cloud.status === 'error' ? cloud.error ?? 'Помилка синхронізації' : when ? `Збережено в хмарі · ${when}` : 'Збережено в хмарі';
    const signOut = () => {
      const text = 'Бібліотека залишиться у вашому акаунті, а з цього пристрою буде прибрана до наступного входу.';
      if (Platform.OS === 'web') {
        if (globalThis.confirm?.(`Вийти з акаунта?\n\n${text}`)) cloud.signOut();
        return;
      }
      Alert.alert('Вийти з акаунта?', text, [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Вийти', style: 'destructive', onPress: () => cloud.signOut() },
      ]);
    };
    return (
      <View style={styles.card}>
        <Row icon="person-circle" color={colors.like} title={cloud.email} />
        <View style={styles.statusRow}>
          {cloud.status === 'syncing' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name={cloud.status === 'error' ? 'alert-circle' : 'cloud-done'} size={16} color={cloud.status === 'error' ? colors.nope : colors.like} />
          )}
          <Text style={[styles.muted, { flex: 1 }, cloud.status === 'error' && { color: colors.nope }]}>{statusText}</Text>
          <Pressable onPress={cloud.syncNow} hitSlop={8} disabled={cloud.status === 'syncing'}>
            <Text style={styles.link}>{cloud.status === 'error' ? 'Повторити' : 'Оновити'}</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>Відкладене, збережене в Obsidian, прочитане, вимкнені джерела й налаштування зберігаються у вашому акаунті й доступні з будь-якого телефону — просто увійдіть тим самим email.</Text>
        <Pressable onPress={signOut} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.nope} />
          <Text style={styles.signOutText}>Вийти з акаунта</Text>
        </Pressable>
      </View>
    );
  }

  const submit = async () => {
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setMsg({ text: 'Введіть коректний email' });
    if (mode !== 'reset' && password.length < 6) return setMsg({ text: 'Пароль має містити щонайменше 6 символів' });
    setBusy(true);
    setMsg(null);
    if (mode === 'reset') {
      const err = await cloud.resetPassword(mail);
      setBusy(false);
      setMsg(err ? { text: err } : { text: 'Лист надіслано. Відкрийте посилання з нього на цьому пристрої й задайте новий пароль.', ok: true });
      return;
    }
    const err = mode === 'in' ? await cloud.signIn(mail, password) : await cloud.signUp(mail, password);
    setBusy(false);
    if (err) setMsg({ text: err, ok: /надіслали лист/.test(err) });
    else {
      // увійшли — очищаємо форму, щоб після виходу вона була чистою
      setPassword('');
      setMsg(null);
      setMode('in');
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setMsg(null);
  };

  return (
    <View style={styles.card}>
      <Row icon="cloud-upload-outline" color={colors.accent} title={mode === 'reset' ? 'Відновлення пароля' : 'Збережіть бібліотеку в акаунті'} />
      <Text style={styles.muted}>
        {mode === 'reset'
          ? 'Вкажіть email акаунта — надішлемо посилання, щоб задати новий пароль.'
          : 'Увійдіть, щоб відкладене, збережене й прочитане не зникло і було на всіх ваших пристроях. Підходить той самий акаунт, що й у MovieCasting та CookCasting. Те, що вже є на цьому телефоні, додасться до акаунта.'}
      </Text>
      {mode !== 'reset' ? (
        <View style={{ marginTop: 14 }}>
          <Segmented
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'in', label: 'Вхід' },
              { value: 'up', label: 'Реєстрація' },
            ]}
          />
        </View>
      ) : null}
      <View style={styles.input}>
        <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          onSubmitEditing={mode === 'reset' ? submit : undefined}
          style={styles.inputText}
        />
      </View>
      {mode !== 'reset' ? (
        <View style={styles.input}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Пароль (від 6 символів)"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onSubmitEditing={submit}
            style={styles.inputText}
          />
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? 'Сховати пароль' : 'Показати пароль'}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {msg ? <Text style={[styles.muted, { color: msg.ok ? colors.like : colors.nope, marginTop: 8 }]}>{msg.text}</Text> : null}
      <GradientButton
        title={busy ? 'Зачекайте…' : mode === 'in' ? 'Увійти' : mode === 'up' ? 'Створити акаунт' : 'Надіслати лист'}
        icon={mode === 'in' ? 'log-in-outline' : mode === 'up' ? 'person-add-outline' : 'mail-outline'}
        onPress={busy ? undefined : submit}
        style={{ marginTop: 14 }}
      />
      {mode === 'in' ? (
        <Pressable onPress={() => switchMode('reset')} style={styles.forgot} hitSlop={6}>
          <Text style={styles.link}>Забули пароль?</Text>
        </Pressable>
      ) : mode === 'reset' ? (
        <Pressable onPress={() => switchMode('in')} style={styles.forgot} hitSlop={6}>
          <Text style={styles.link}>← Назад до входу</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ icon, color, title }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  link: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  forgot: { alignSelf: 'center', marginTop: 12 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 12, height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { color: colors.nope, fontWeight: '700', fontSize: 15 },
});
