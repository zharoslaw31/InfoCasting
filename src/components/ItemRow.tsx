import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { excerptOf, KIND, readMinutes, shortNum, timeAgo, titleOf } from '../lib/feed';
import { Item, Source } from '../lib/types';
import { colors, radius } from '../theme';

type Props = {
  it: Item;
  src?: Source;
  translate: boolean;
  read?: boolean;
  liked?: boolean;
  saved?: boolean;
  saving?: boolean;
  onOpen: () => void;
  onLike?: () => void;
  onSave?: () => void;
  /** підпис праворуч зверху замість часу (напр. «збережено 2 дні тому») */
  note?: string;
};

export const ItemRow = React.memo(function ItemRow({ it, src, translate, read, liked, saved, saving, onOpen, onLike, onSave, note }: Props) {
  const kindColor = it.k === 'tg' ? colors.tg : it.k === 'reddit' ? colors.reddit : colors.accent;
  const title = titleOf(it, translate);
  const ex = excerptOf(it, translate);
  const showEx = it.k === 'tg' ? ex && ex !== title : !!ex;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.meta}>
          <Ionicons name={KIND[it.k].icon} size={12} color={kindColor} />
          <Text style={styles.metaText} numberOfLines={1}>
            {it.k === 'reddit' && it.r ? it.r : (src?.name ?? '')} · {note ?? timeAgo(it.d)}
            {it.k !== 'tg' && it.w > 150 ? ` · ${readMinutes(it)} хв` : ''}
          </Text>
          {it.l === 'en' ? <Text style={styles.lang}>EN</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, read && { color: colors.textMuted }]} numberOfLines={3}>
              {title}
            </Text>
            {showEx ? (
              <Text style={[styles.ex, read && { color: colors.textMuted }]} numberOfLines={it.k === 'tg' ? 3 : 2}>
                {ex}
              </Text>
            ) : null}
          </View>
          {it.i ? <Image source={{ uri: it.i }} style={styles.thumb} contentFit="cover" transition={150} /> : null}
        </View>
        <View style={styles.actions}>
          {it.sc != null ? <Text style={styles.stat}>⬆ {shortNum(it.sc)}</Text> : null}
          {it.nc ? <Text style={styles.stat}>💬 {shortNum(it.nc)}</Text> : null}
          {it.v ? <Text style={styles.stat}>👁 {it.v}</Text> : null}
          <View style={{ flex: 1 }} />
          {onLike ? (
            <Pressable hitSlop={8} onPress={onLike} accessibilityLabel={liked ? 'Прибрати з «Прочитати»' : 'Прочитати пізніше'} style={styles.act}>
              <Ionicons name={liked ? 'bookmark' : 'bookmark-outline'} size={19} color={liked ? colors.like : colors.textMuted} />
            </Pressable>
          ) : null}
          {onSave ? (
            <Pressable hitSlop={8} onPress={onSave} disabled={saving} accessibilityLabel="Зберегти в Obsidian" style={styles.act}>
              {saving ? <ActivityIndicator size="small" color={colors.cooked} /> : <Ionicons name={saved ? 'diamond' : 'diamond-outline'} size={18} color={saved ? colors.cooked : colors.textMuted} />}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metaText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  lang: { color: colors.gold, fontSize: 10, fontWeight: '900', borderWidth: 1, borderColor: colors.gold + '66', borderRadius: 4, paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  ex: { color: colors.textDim, fontSize: 14, lineHeight: 19, marginTop: 4 },
  thumb: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: colors.card },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, minHeight: 30 },
  stat: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  act: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
});
