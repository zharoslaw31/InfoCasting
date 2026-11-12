import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { excerptOf, KIND, readMinutes, shortNum, timeAgo, titleOf, useFeed } from '../lib/feed';
import { useStore } from '../lib/store';
import { Item, SwipeKind } from '../lib/types';
import { colors, gradients, radius } from '../theme';
import { InfoBadge, Photo } from './ui';

export type SwipeDeckHandle = { swipe: (kind: SwipeKind) => void };

type Props = {
  movies: Item[]; // movies[0] — верхня картка
  onSwipe: (recipe: Item, kind: SwipeKind) => void;
  onOpen: (recipe: Item) => void;
};

// На вебі забороняємо браузеру прокручувати сторінку, коли тягнемо картку пальцем.
const WEB_NO_SCROLL = { dataSet: { swipeCard: 'true' } } as object;

const SWIPE_X = 110;
const SWIPE_Y = 120;

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck({ movies, onSwipe, onOpen }, ref) {
  const { width, height } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const top = movies[0];
  const latest = useRef({ top, onSwipe });
  latest.current = { top, onSwipe };

  // Нова верхня картка завжди стартує з центру (до відмальовування кадру).
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    busy.current = false;
  }, [top?.id, pan]);

  const fling = (kind: SwipeKind, vx = 0) => {
    const current = latest.current.top;
    if (!current || busy.current) return;
    busy.current = true;
    const to =
      kind === 'like' ? { x: width * 1.5, y: 40 } : kind === 'nope' ? { x: -width * 1.5, y: 40 } : { x: 0, y: -height * 1.2 };
    Animated.timing(pan, {
      toValue: to,
      duration: Math.max(160, 300 - Math.abs(vx) * 60),
      useNativeDriver: false,
    }).start(() => latest.current.onSwipe(current, kind));
  };

  useImperativeHandle(ref, () => ({ swipe: (k) => fling(k) }));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_X || g.vx > 1.2) return fling('like', g.vx);
          if (g.dx < -SWIPE_X || g.vx < -1.2) return fling('nope', g.vx);
          if (g.dy < -SWIPE_Y || g.vy < -1.4) return fling('save', g.vy);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, tension: 60, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  const rotate = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-14deg', '0deg', '14deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [20, SWIPE_X], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_X, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const cookedOpacity = pan.y.interpolate({ inputRange: [-SWIPE_Y, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pan.x.interpolate({ inputRange: [-width / 2, 0, width / 2], outputRange: [1, 0.93, 1], extrapolate: 'clamp' });

  const visible = movies.slice(0, 3);

  return (
    <View style={styles.deck} {...WEB_NO_SCROLL}>
      {visible
        .map((m, i) => {
          if (i === 0) {
            return (
              <Animated.View
                key={m.id}
                {...responder.panHandlers}
                style={[styles.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
              >
                <Card movie={m} onOpen={() => onOpen(m)} />
                <Stamp label="ПРОЧИТАЮ" color={colors.like} style={{ left: 24, transform: [{ rotate: '-14deg' }] }} opacity={likeOpacity} />
                <Stamp label="ПРОПУСК" color={colors.nope} style={{ right: 24, transform: [{ rotate: '14deg' }] }} opacity={nopeOpacity} />
                <Stamp label="В OBSIDIAN" color={colors.cooked} style={{ alignSelf: 'center', top: '40%' }} opacity={cookedOpacity} />
              </Animated.View>
            );
          }
          return (
            <Animated.View
              key={m.id}
              pointerEvents="none"
              style={[styles.card, { transform: [{ scale: i === 1 ? nextScale : 0.88 }, { translateY: i === 1 ? 0 : 18 }], opacity: i === 1 ? 1 : 0.6 }]}
            >
              <Card movie={m} />
            </Animated.View>
          );
        })
        .reverse()}
    </View>
  );
});

function Stamp({ label, color, style, opacity }: { label: string; color: string; style: object; opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: color, opacity }, style]}>
      <Text style={[styles.stampText, { color }]}>{label}</Text>
    </Animated.View>
  );
}

const Card = React.memo(function Card({ movie: it, onOpen }: { movie: Item; onOpen?: () => void }) {
  const { sourceOf } = useFeed();
  const { state } = useStore();
  const tr = state.settings.translate;
  const src = sourceOf(it.s);
  const kind = KIND[it.k];
  const kindColor = it.k === 'tg' ? colors.tg : it.k === 'reddit' ? colors.reddit : colors.accent;
  const title = titleOf(it, tr);
  const hasImg = !!it.i;
  return (
    <Pressable style={[StyleSheet.absoluteFill, styles.cardInner]} onPress={onOpen} disabled={!onOpen}>
      {hasImg ? (
        <View style={styles.imgWrap}>
          <Photo uri={it.i} rounded={0} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', 'rgba(24,29,42,0.0)', colors.card]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <LinearGradient colors={[kindColor + '40', colors.card]} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.topRow}>
        <InfoBadge icon={kind.icon} text={kind.label} color={kindColor} />
        <InfoBadge icon="time-outline" text={it.k === 'tg' && it.w < 120 ? timeAgo(it.d) : `${readMinutes(it)} хв · ${timeAgo(it.d)}`} color={colors.textDim} />
        {it.l === 'en' ? <InfoBadge text={tr ? 'EN → UA' : 'EN'} color={colors.gold} /> : null}
        {it.sc != null ? <InfoBadge icon="arrow-up" text={shortNum(it.sc)} color={colors.reddit} /> : null}
      </View>
      <View style={[styles.info, !hasImg && { top: 60, justifyContent: 'center' }]}>
        <Text style={styles.source} numberOfLines={1}>
          {src?.group ? src.group.split(' ')[0] + ' ' : ''}
          {it.k === 'reddit' && it.r ? it.r : src?.name ?? ''}
          {it.k === 'rss' && it.a && it.a !== src?.name ? ` · ${it.a}` : ''}
        </Text>
        <Text style={[styles.title, !hasImg && { fontSize: 26 }, title.length > 110 && { fontSize: 20 }]} numberOfLines={hasImg ? 4 : 6}>
          {title}
        </Text>
        <Text style={styles.overview} numberOfLines={hasImg ? 4 : 12}>
          {excerptOf(it, tr)}
        </Text>
        {onOpen ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>Читати{it.k === 'reddit' && it.nc ? ` · 💬 ${shortNum(it.nc)}` : ''}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  deck: { flex: 1, marginHorizontal: 14 },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardInner: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  imgWrap: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  topRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  info: { position: 'absolute', left: 20, right: 20, bottom: 20 },
  source: { color: colors.accent2, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  title: { color: '#fff', fontSize: 23, lineHeight: 29, fontWeight: '900', letterSpacing: -0.3 },
  overview: { color: '#C9CFDD', fontSize: 15, lineHeight: 21, marginTop: 10 },
  more: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  moreText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  stamp: { position: 'absolute', top: 70, borderWidth: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(10,12,18,0.45)' },
  stampText: { fontSize: 24, fontWeight: '900', letterSpacing: 1 },
});
