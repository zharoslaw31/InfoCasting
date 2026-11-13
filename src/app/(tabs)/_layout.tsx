import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../lib/store';
import { colors, gradients, TAB_BAR_HEIGHT } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { title: string; icon: IconName; iconActive: IconName }> = {
  index: { title: 'Кастинг', icon: 'flame-outline', iconActive: 'flame' },
  feed: { title: 'Стрічка', icon: 'newspaper-outline', iconActive: 'newspaper' },
  library: { title: 'Бібліотека', icon: 'albums-outline', iconActive: 'albums' },
  profile: { title: 'Профіль', icon: 'person-circle-outline', iconActive: 'person-circle' },
};

function TabBar({ state, navigateToTab, emitter, insets }: BottomTabBarProps) {
  const { state: store, readIds } = useStore();
  const unreadLiked = React.useMemo(() => store.liked.filter((e) => !readIds.has(e.id)).length, [store.liked, readIds]);
  const bottom = Math.max(insets.bottom, 12);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottom }]}>
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,22,33,0.96)' }]} />
        )}
        {state.routes.map((route, index) => {
          const cfg = TABS[route.name];
          if (!cfg) return null;
          const focused = state.index === index;
          const badge = route.name === 'library' ? unreadLiked : 0;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={cfg.title}
              onPress={() => {
                const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
              }}
              style={styles.item}
            >
              <View style={styles.iconWrap}>
                {focused ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activePill} /> : null}
                <Ionicons name={focused ? cfg.iconActive : cfg.icon} size={22} color={focused ? '#fff' : colors.textMuted} />
                {badge > 0 && !focused ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, focused && { color: colors.text }]}>{cfg.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Кастинг' }} />
      <Tabs.Screen name="feed" options={{ title: 'Стрічка' }} />
      <Tabs.Screen name="library" options={{ title: 'Бібліотека' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профіль' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 26,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  iconWrap: { width: 48, height: 30, alignItems: 'center', justifyContent: 'center' },
  activePill: { ...StyleSheet.absoluteFill, borderRadius: 15 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 3 },
  badge: { position: 'absolute', top: -4, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
