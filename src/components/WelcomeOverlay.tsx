/**
 * WelcomeOverlay — the wow-moment when hermesSnapshot transitions
 * from null to non-null for the first time after app launch.
 *
 * Triggers:  the gateway becomes reachable AND the user hasn't
 * already seen this overlay (one-shot, persisted via AsyncStorage
 * key 'hermes-chat:welcome-seen').
 *
 * UX:  full-screen modal with 90% black, big 🎉 emoji, hero line,
 * 3 quick hints, and a "Let's go" button. Animated entrance
 * (spring scale 0 → 1). Auto-dismisses after 5 s if the user
 * doesn't tap.
 *
 * The "first time only" flag is per-install, not per-session.
 * Returning users see it once, then it gets out of the way.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { neutral, type, space, radius, useTheme } from '../theme';
import { Button } from './win95';
import { haptic } from '../utils/haptic';

const SEEN_KEY = 'hermes-chat:welcome-seen';
const AUTO_DISMISS_MS = 8_000;

export const WelcomeOverlay: React.FC<{ visible: boolean; onDismiss: () => void }> = ({ visible, onDismiss }) => {
  const accent = useTheme();
  const [mounted, setMounted] = useState(visible);
  const scale = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      haptic('success');
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
      const t = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
      return () => clearTimeout(t);
    } else {
      setMounted(false);
    }
  }, [visible, onDismiss, scale, opacity]);

  if (!mounted) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: 'rgba(0,0,0,0.78)' }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { backgroundColor: neutral.surface, borderColor: accent.accent.fg, transform: [{ scale }], opacity }]}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Found Hermes!</Text>
        <Text style={styles.subtitle}>
          Connected to your local agent on port 8642.
        </Text>

        <View style={[styles.statRow, { borderColor: neutral.border }]}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>📡</Text>
            <Text style={styles.statLabel}>Live</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: neutral.border }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>🆔</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: neutral.border }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>🔄</Text>
            <Text style={styles.statLabel}>Sync</Text>
          </View>
        </View>

        <View style={styles.tips}>
          <Tip emoji="☰" text="Pull the drawer to import a remote session." />
          <Tip emoji="🔄" text="Tap 🔄 in the app bar to pull the latest from Hermes." />
          <Tip emoji="🎙" text="Hold 🎙 to talk to your agent." />
          <Tip emoji="🆔" text="Long-press the title to copy the session id." />
        </View>

        <Button label="Let's go ♡" default onPress={onDismiss} />
      </Animated.View>
    </View>
  );
};

const Tip: React.FC<{ emoji: string; text: string }> = ({ emoji, text }) => (
  <View style={styles.tipRow}>
    <Text style={styles.tipEmoji}>{emoji}</Text>
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%', maxWidth: 360,
    padding: space.lg, borderRadius: radius.lg,
    borderWidth: 2, alignItems: 'center', gap: space.sm,
  },
  emoji: { fontSize: 64 },
  title: { ...type.hero, color: neutral.ink, fontSize: 24 },
  subtitle: { ...type.bodyMd, color: neutral.inkSoft, textAlign: 'center', fontSize: 14 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    paddingVertical: space.xs, paddingHorizontal: space.sm,
    borderWidth: 1, borderRadius: radius.md,
    marginVertical: space.xs,
  },
  stat: { alignItems: 'center', paddingHorizontal: space.sm, minWidth: 60 },
  statNum: { fontSize: 18 },
  statLabel: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10, marginTop: 2 },
  statSep: { width: 1, height: 20 },
  tips: { alignSelf: 'stretch', gap: 6, marginTop: 4, marginBottom: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipEmoji: { fontSize: 14, width: 20, textAlign: 'center' },
  tipText: { ...type.body, color: neutral.ink, flex: 1, fontSize: 13 },
});

/**
 * Helper that decides whether the welcome overlay should fire for the
 * current session. Returns true on the very first connection event;
 * false on every subsequent reachability change.
 */
export async function shouldShowWelcome(snap: { updatedAt: number } | null): Promise<boolean> {
  if (!snap) return false;
  try {
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    return seen !== '1';
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
}
