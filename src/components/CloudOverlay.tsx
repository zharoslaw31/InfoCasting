import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloud } from '../lib/cloud';
import { colors, radius } from '../theme';
import { GhostButton, GradientButton } from './ui';

/** Поверх усього додатка: новий пароль після посилання з листа і короткі повідомлення акаунта. */
export function CloudOverlay() {
  const cloud = useCloud();
  const insets = useSafeAreaInsets();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud.notice || cloud.recovery) return;
    const t = setTimeout(cloud.clearNotice, 4500);
    return () => clearTimeout(t);
  }, [cloud.notice, cloud.recovery, cloud.clearNotice]);

  if (cloud.recovery) {
    const save = async () => {
      if (pw.length < 6) return setMsg('Мінімум 6 символів');
      setBusy(true);
      setMsg(null);
      const err = await cloud.updatePassword(pw);
      setBusy(false);
      if (err) setMsg(err);
      else setPw('');
    };
    return (
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Новий пароль</Text>
          <Text style={styles.muted}>Придумайте новий пароль для входу в акаунт.</Text>
          <View style={styles.input}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={pw}
              onChangeText={setPw}
              placeholder="Новий пароль (від 6 символів)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoComplete="new-password"
              autoFocus
              onSubmitEditing={save}
              style={styles.inputText}
            />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          {msg ? <Text style={[styles.muted, { color: colors.nope, marginTop: 8 }]}>{msg}</Text> : null}
          <GradientButton title={busy ? 'Зберігаємо…' : 'Зберегти пароль'} icon="checkmark" onPress={busy ? undefined : save} style={{ marginTop: 14 }} />
          <GhostButton title="Пізніше" onPress={cloud.cancelRecovery} style={{ marginTop: 10 }} />
        </View>
      </View>
    );
  }

  if (cloud.notice) {
    return (
      <Pressable onPress={cloud.clearNotice} style={[styles.notice, { top: insets.top + 10 }]}>
        <Ionicons name={cloud.notice.ok ? 'cloud-done' : 'alert-circle'} size={18} color={cloud.notice.ok ? colors.like : colors.nope} />
        <Text style={styles.noticeText}>{cloud.notice.text}</Text>
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,10,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingHorizontal: 12, height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  notice: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: 'rgba(30,30,46,0.98)', borderWidth: 1, borderColor: colors.border, zIndex: 100, maxWidth: '92%' },
  noticeText: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
});
