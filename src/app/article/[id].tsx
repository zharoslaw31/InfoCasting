import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toast } from '../../components/ui';
import { hostOf, KIND, readMinutes, shortNum, timeAgo, useFeed } from '../../lib/feed';
import { goBack } from '../../lib/nav';
import { needsTranslation, useArticle } from '../../lib/reader';
import { shareItem, translatedPageUrl } from '../../lib/share';
import { useStore } from '../../lib/store';
import { Block, Comment, Item } from '../../lib/types';
import { useSaveToObsidian } from '../../lib/useSave';
import { colors, radius } from '../../theme';

const openUrl = (u: string) => {
  if (Platform.OS === 'web') window.open(u, '_blank', 'noopener');
  else Linking.openURL(u);
};

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { byId, sourceOf } = useFeed();
  const { state, dispatch, isLiked, isSaved } = useStore();
  const { save, busy } = useSaveToObsidian();
  const [toast, setToast] = useState<string | null>(null);
  const [showOrig, setShowOrig] = useState(!state.settings.translate);

  // матеріал зі стрічки, а якщо він уже зник зі стрічки — із Бібліотеки
  const it: Item | undefined = useMemo(
    () => byId(id) ?? [...state.liked, ...state.saved, ...state.read, ...state.skipped].find((e) => e.id === id)?.item,
    [id, byId, state.liked, state.saved, state.read, state.skipped],
  );
  const { content, tr, loading, translating, error } = useArticle(it, !showOrig);

  useEffect(() => {
    if (it) dispatch({ type: 'markRead', items: [it] });
  }, [it?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3500);
  };

  if (!it) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 40 }}>🫥</Text>
        <Text style={styles.empty}>Цього матеріалу вже немає в стрічці</Text>
        <Pressable onPress={goBack} style={[styles.pill, { marginTop: 16 }]}>
          <Text style={styles.pillText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  const src = sourceOf(it.s);
  const kindColor = it.k === 'tg' ? colors.tg : it.k === 'reddit' ? colors.reddit : colors.accent;
  const canTranslate = !!content && needsTranslation(content, it);
  const useTr = !showOrig && !!tr;
  const blocks: Block[] = (useTr ? tr!.b : content?.b) ?? [];
  const comments: Comment[] | undefined = useTr ? tr!.cm : content?.cm;
  const title = !showOrig && it.tu ? it.tu : it.t;
  const shortText = it.k === 'rss' && it.w < 140;
  const heroInBlocks = !!it.i && blocks.some((b) => b[0] === 'img' && b[1] === it.i);
  const liked = isLiked(it.id);
  const saved = isSaved(it.id);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={goBack} style={styles.iconBtn} accessibilityLabel="Назад">
          <Ionicons name="chevron-down" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {canTranslate || it.l === 'en' ? (
          <Pressable onPress={() => setShowOrig(!showOrig)} style={[styles.langBtn, !showOrig && { borderColor: colors.gold + '99' }]}>
            <Ionicons name="language-outline" size={16} color={showOrig ? colors.textDim : colors.gold} />
            <Text style={[styles.langText, !showOrig && { color: colors.gold }]}>{showOrig ? 'Оригінал' : 'Українською'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => shareItem(it).then((r) => r === 'copied' && showToast('Посилання скопійовано'))}
          style={styles.iconBtn}
          accessibilityLabel="Поділитися"
        >
          <Ionicons name="share-outline" size={21} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={styles.body}>
          {it.i && !heroInBlocks && it.k !== 'tg' ? <Image source={{ uri: it.i }} style={styles.hero} contentFit="cover" transition={200} /> : null}
          <View style={styles.metaRow}>
            <View style={[styles.kindPill, { borderColor: kindColor + '77' }]}>
              <Ionicons name={KIND[it.k].icon} size={12} color={kindColor} />
              <Text style={[styles.kindText, { color: kindColor }]}>{it.k === 'reddit' && it.r ? it.r : (src?.name ?? KIND[it.k].label)}</Text>
            </View>
            {src?.group ? <Text style={styles.group}>{src.group}</Text> : null}
          </View>
          <Text style={styles.title} selectable>
            {title}
          </Text>
          {!showOrig && it.tu && it.tu !== it.t ? (
            <Text style={styles.origTitle} selectable>
              {it.t}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            {[it.a && it.a !== src?.name ? it.a : '', timeAgo(it.d), it.w > 150 ? `${readMinutes(it)} хв читання` : '', it.sc != null ? `⬆ ${shortNum(it.sc)}` : '', it.v ? `👁 ${it.v}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {translating ? (
            <View style={styles.banner}>
              <ActivityIndicator size="small" color={colors.gold} />
              <Text style={styles.bannerText}>Перекладаю українською…</Text>
            </View>
          ) : null}
          {error ? <Text style={[styles.bannerText, { marginTop: 10 }]}>{error}</Text> : null}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
          ) : (
            <View style={{ marginTop: 14 }}>
              {it.k === 'tg' && it.i ? <ArticleImage uri={it.i} /> : null}
              {blocks.map((b, i) => (
                <BlockView key={i} b={b} />
              ))}
              {!blocks.length ? <Text style={styles.p}>{!showOrig && it.xu ? it.xu : it.x}</Text> : null}
            </View>
          )}

          {it.e ? (
            <Pressable onPress={() => openUrl(it.e!)} style={styles.linkCard}>
              <Ionicons name="link-outline" size={18} color={colors.accent} />
              <Text style={styles.linkText} numberOfLines={1}>
                {hostOf(it.e)}
              </Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {shortText && !loading ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>Джерело дає в стрічці лише анонс. Повна стаття — на сайті{it.l === 'en' ? ', можна одразу перекладом' : ''}.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable onPress={() => openUrl(it.u)} style={styles.pill}>
                  <Text style={styles.pillText}>Відкрити сайт</Text>
                </Pressable>
                {it.l === 'en' ? (
                  <Pressable onPress={() => openUrl(translatedPageUrl(it.u))} style={[styles.pill, { borderColor: colors.gold + '88' }]}>
                    <Text style={[styles.pillText, { color: colors.gold }]}>文A Сайт українською</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {it.k === 'reddit' ? (
            <View style={{ marginTop: 22 }}>
              <Text style={styles.h}>💬 Коментарі{it.nc ? ` · ${shortNum(it.nc)}` : ''}</Text>
              {loading ? null : comments?.length ? (
                comments.map((c, i) => <CommentView key={i} c={c} />)
              ) : (
                <Text style={styles.noteText}>Коментарі не завантажились. Вони є на Reddit.</Text>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {toast ? <Toast text={toast} bottom={insets.bottom + 90} /> : null}

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <BarBtn
          icon={liked ? 'bookmark' : 'bookmark-outline'}
          label={liked ? 'Відкладено' : 'Прочитаю'}
          color={liked ? colors.like : colors.text}
          onPress={() => (liked ? dispatch({ type: 'remove', id: it.id, list: 'liked' }) : dispatch({ type: 'add', item: it, list: 'liked' }))}
        />
        <BarBtn
          icon={saved ? 'diamond' : 'diamond-outline'}
          label={busy === it.id ? 'Зберігаю…' : saved ? 'Ще раз в Obsidian' : 'В Obsidian'}
          color={colors.cooked}
          busy={busy === it.id}
          onPress={() => save(it, { content, tr: showOrig ? null : tr }).then((r) => showToast((r.ok ? '✓ ' : '⚠️ ') + r.text))}
        />
        <BarBtn icon="open-outline" label={it.k === 'tg' ? 'Telegram' : it.k === 'reddit' ? 'Reddit' : 'Оригінал'} color={colors.text} onPress={() => openUrl(it.u)} />
      </View>
    </View>
  );
}

function BarBtn({ icon, label, color, onPress, busy }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={21} color={color} />}
      <Text style={[styles.barText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ArticleImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      style={[styles.img, { aspectRatio: ratio }]}
      contentFit="contain"
      transition={150}
      onLoad={(e) => e.source.width && e.source.height && setRatio(Math.max(0.5, Math.min(3, e.source.width / e.source.height)))}
      onError={() => setFailed(true)}
    />
  );
}

const BlockView = React.memo(function BlockView({ b }: { b: Block }) {
  const [type, v] = b;
  if (type === 'img') return <ArticleImage uri={v} />;
  if (type === 'h') return <Text style={styles.h} selectable>{v}</Text>;
  if (type === 'li')
    return (
      <View style={styles.li}>
        <Text style={styles.bullet}>•</Text>
        <Text style={[styles.p, { flex: 1, marginBottom: 6 }]} selectable>
          {v}
        </Text>
      </View>
    );
  if (type === 'q') return <Text style={styles.q} selectable>{v}</Text>;
  if (type === 'pre')
    return (
      <ScrollView horizontal style={styles.pre}>
        <Text style={styles.preText} selectable>
          {v}
        </Text>
      </ScrollView>
    );
  return <Text style={styles.p} selectable>{v}</Text>;
});

function CommentView({ c }: { c: Comment }) {
  return (
    <View style={[styles.comment, { marginLeft: c.d * 14 }, c.d > 0 && { borderLeftColor: colors.border }]}>
      <Text style={styles.cAuthor}>
        u/{c.a} <Text style={{ color: colors.textMuted }}>· ⬆ {shortNum(c.s)}</Text>
      </Text>
      <Text style={styles.cText} selectable>
        {c.t}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  langText: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  body: { maxWidth: 720, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: colors.card, marginBottom: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kindPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  kindText: { fontSize: 12, fontWeight: '800' },
  group: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '900', letterSpacing: -0.4, marginTop: 12 },
  origTitle: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', marginTop: 6 },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 10, borderRadius: radius.md, backgroundColor: colors.gold + '14' },
  bannerText: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  p: { color: colors.text, fontSize: 17, lineHeight: 27, marginBottom: 14 },
  h: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '900', marginTop: 10, marginBottom: 10 },
  li: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
  bullet: { color: colors.accent, fontSize: 17, lineHeight: 27, fontWeight: '900' },
  q: { color: colors.textDim, fontSize: 17, lineHeight: 26, fontStyle: 'italic', borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 14, marginBottom: 14 },
  pre: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: 12, marginBottom: 14 },
  preText: { color: colors.textDim, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
  img: { width: '100%', borderRadius: radius.md, backgroundColor: colors.card, marginBottom: 14 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginTop: 6 },
  linkText: { flex: 1, color: colors.text, fontWeight: '700' },
  note: { marginTop: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  noteText: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  comment: { paddingVertical: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.reddit + '66', marginBottom: 4 },
  cAuthor: { color: colors.textDim, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  cText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 10, paddingHorizontal: 10, backgroundColor: 'rgba(18,22,33,0.97)', borderTopWidth: 1, borderTopColor: colors.border },
  barBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  barText: { fontSize: 12, fontWeight: '800' },
  empty: { color: colors.textDim, fontSize: 16, marginTop: 10 },
});
