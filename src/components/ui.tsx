import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, gradients, radius } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Photo({
  uri,
  title,
  style,
  rounded = radius.md,
  icon = 'newspaper-outline',
}: {
  uri: string | null | undefined;
  title?: string;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
  icon?: IconName | null;
}) {
  return (
    <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: colors.card }, style]}>
      <LinearGradient colors={['#1C2740', '#10141E']} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {icon ? <Ionicons name={icon} size={28} color={colors.textMuted} /> : null}
        {title ? (
          <Text numberOfLines={2} style={styles.posterFallback}>
            {title}
          </Text>
        ) : null}
      </View>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  tone = 'brand',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: string;
  tone?: 'brand' | 'nope';
}) {
  const activeBg = tone === 'nope' ? colors.nope : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: activeBg + '26', borderColor: activeBg },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? <Text style={{ marginRight: 6 }}>{icon}</Text> : null}
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function RoundButton({
  icon,
  size = 60,
  color,
  onPress,
  filled,
  disabled,
  iconSize,
}: {
  icon: IconName;
  size?: number;
  color: string;
  onPress?: () => void;
  filled?: readonly [string, string];
  disabled?: boolean;
  iconSize?: number;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: pressed ? 0.9 : 1 }],
          opacity: disabled ? 0.35 : 1,
        },
        styles.round,
        !filled && { borderColor: color + '55' },
      ]}
    >
      {filled ? <LinearGradient colors={filled} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} /> : null}
      <Ionicons name={icon} size={iconSize ?? size * 0.45} color={filled ? '#fff' : color} />
    </Pressable>
  );
}

export function GradientButton({
  title,
  onPress,
  icon,
  colorsPair = gradients.brand,
  style,
  small,
  tight,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  colorsPair?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  /** менші бокові відступи — для рядка з кількох кнопок */
  tight?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ borderRadius: radius.pill, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }, style]}>
      <LinearGradient colors={colorsPair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.gbtn, small && { paddingVertical: 10, paddingHorizontal: 16 }, tight && { paddingHorizontal: 12 }]}>
        {icon ? <Ionicons name={icon} size={small ? 16 : 18} color="#fff" style={{ marginRight: 8 }} /> : null}
        <Text style={[styles.gbtnText, small && { fontSize: 14 }]} numberOfLines={1}>
          {title}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ title, onPress, icon, style, tight }: { title: string; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; tight?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, tight && { paddingHorizontal: 12 }, pressed && { opacity: 0.7 }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.text} style={{ marginRight: 8 }} /> : null}
      <Text style={styles.gbtnText} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function InfoBadge({ icon, text, color = colors.text, style }: { icon?: IconName; text: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, style]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

/** Оцінка 1–5 зірками. */
export function Stars({ value, onChange, size = 26 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.gold : colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  compact,
}: {
  value: T;
  options: { value: T; label: string; count?: number; dot?: boolean }[];
  onChange: (v: T) => void;
  /** дрібніший шрифт — для 4+ варіантів */
  compact?: boolean;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, compact && o.count !== undefined && { paddingVertical: 6 }]}>
            {active ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
            <Text style={[styles.segText, compact && { fontSize: 12.5 }, active && { color: '#fff' }]} numberOfLines={1}>
              {o.label}
              {o.count !== undefined && !compact ? `  ${o.count}` : ''}
            </Text>
            {o.count !== undefined && compact ? (
              <Text style={[styles.segCount, active && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
                {o.count > 9999 ? Math.round(o.count / 1000) + 'K' : o.count}
              </Text>
            ) : null}
            {o.dot ? <View style={styles.segDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Коротке повідомлення внизу екрана. */
export function Toast({ text, bottom }: { text: string; bottom: number }) {
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom }]}>
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: 'rgba(30,30,46,0.97)', borderWidth: 1, borderColor: colors.border, zIndex: 20, maxWidth: '90%' },
  toastText: { color: colors.text, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  posterFallback: { color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  gbtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, paddingHorizontal: 22 },
  gbtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,12,18,0.78)',
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  seg: { flexDirection: 'row', backgroundColor: colors.bgElevated, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segCount: { color: colors.textMuted, fontWeight: '800', fontSize: 11, marginTop: 1 },
  segText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  segDot: { position: 'absolute', top: 5, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cooked },
});
