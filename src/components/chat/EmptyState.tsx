/**
 * Mobile-first EmptyState. Designed for the primary use case:
 * "open the app, drive the Hermes agent on my computer from my phone."
 *
 * Three blocks, in order:
 *   1. Hero illustration (remote-hero.png) with status overlay
 *   2. Live Hermes status card (idle / running / offline)
 *   3. Quick action grid: voice / photo / new session / open existing
 *
 * The quick action callbacks are forwarded to the parent so the
 * composer / drawer can react without EmptyState knowing about them.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated, Easing, ActivityIndicator } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';
import { useAppStore } from '../../store/app';

export interface QuickAction {
  id: 'voice' | 'photo' | 'new-session' | 'open-existing';
  label: string;
  hint: string;
  emoji: string;
}

export interface EmptyStateProps {
  /** Live Hermes gateway status. */
  status: 'connecting' | 'idle' | 'running' | 'offline';
  /** Latest in-flight activity label, e.g. "running: fetch_url". */
  statusDetail?: string;
  /** Tapped a quick action card. */
  onAction: (id: QuickAction['id']) => void;
}

const ACTIONS: QuickAction[] = [
  { id: 'voice',         label: 'Voice',      hint: 'Hold to talk to Hermes',        emoji: '🎙' },
  { id: 'photo',         label: 'Photo',      hint: 'Send an image with your ask',   emoji: '📷' },
  { id: 'new-session',   label: 'New chat',   hint: 'Start a fresh conversation',     emoji: '✨' },
  { id: 'open-existing', label: 'Recent',     hint: 'Pick up where you left off',     emoji: '🕒' },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ status, statusDetail, onAction }) => {
  const accent = useTheme();
  const narrow = isNarrow;
  return (
    <ScrollViewEquivalent
      style={styles.root}
      contentContainerStyle={[styles.contentContainer, narrow ? styles.narrow : styles.wide]}
    >
      {/* Hero illustration with status overlay */}
      <View style={styles.heroWrap}>
        <SparkleRing color={accent.accent.fg} count={6} />
        <FallingPetals />
        <View style={[styles.heroImageBox, { borderColor: accent.accent.soft }]}>
          <Image
            source={require('../../../assets/illustrations/remote-hero.png')}
            style={styles.heroImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.heroTitle}>🌸 Hermes</Text>
        <Text style={styles.heroSubtitle}>Drive your agent from your pocket.</Text>
        <Text style={styles.heroHint}>
          {narrow
            ? 'Hold the mic to talk, or pick an action below.'
            : 'Hold the mic to talk, or pick an action below.'}
        </Text>
      </View>

      {/* Live Hermes status card */}
      <StatusCard status={status} detail={statusDetail} />

      {/* If the gateway has reported sessions, surface the count
          right under the status card so a first-time user learns
          that the drawer has remote items to import. */}
      <HermesHasSessionsHint />

      {/* Quick action grid */}
      <View style={styles.actionGrid}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => { haptic('light'); onAction(a.id); }}
            style={({ pressed }) => [
              styles.actionCard,
              pressed ? styles.actionPressed : null,
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: accent.accent.soft }]}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
            </View>
            <Text style={styles.actionLabel}>{a.label}</Text>
            <Text style={styles.actionHint} numberOfLines={2}>{a.hint}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollViewEquivalent>
  );
};

// We use a plain View here instead of ScrollView so the empty state
// stays in the same ScrollView as the message list — the user can
// scroll past it the moment a chat starts. (When the chat is empty,
// this is the only thing in the canvas, and it lays itself out
// centered via the contentContainerStyle.)
const ScrollViewEquivalent: React.FC<{
  style?: any;
  contentContainerStyle?: any;
  children: React.ReactNode;
}> = ({ style, contentContainerStyle, children }) => (
  <View style={style}>
    <View style={contentContainerStyle}>{children}</View>
  </View>
);

// ─── Live status card ───────────────────────────────────────────────────────

const HermesHasSessionsHint: React.FC = () => {
  const snap = useAppStore((s) => s.hermesSnapshot);
  const accent = useTheme();
  if (!snap || snap.sessions.length === 0) return null;
  return (
    <View style={[styles.remoteHint, { backgroundColor: accent.accent.soft, borderColor: accent.accent.fg }]}>
      <Text style={[styles.remoteHintEmoji]}>📡</Text>
      <Text style={[styles.remoteHintText, { color: neutral.ink }]} numberOfLines={2}>
        <Text style={{ fontWeight: '700' }}>{snap.sessions.length}</Text> conversation{snap.sessions.length === 1 ? '' : 's'} on your computer.
        {' '}
        Tap <Text style={{ fontWeight: '700' }}>☰</Text> to import one.
      </Text>
    </View>
  );
};

const StatusCard: React.FC<{ status: EmptyStateProps['status']; detail?: string }> = ({ status, detail }) => {
  const accent = useTheme();
  const meta = (() => {
    switch (status) {
      case 'connecting': return { dot: '#FBBF24', label: 'Looking for Hermes on your network…',     border: neutral.border, icon: '🛰' };
      case 'idle':      return { dot: '#16A34A', label: 'Hermes is online and ready ✨',          border: neutral.ok,    icon: '🌸' };
      case 'running':   return { dot: '#007AFF', label: 'Hermes is working on it',                border: '#007AFF',   icon: '⚡' };
      case 'offline':   return { dot: '#DC2626', label: 'Hermes gateway is offline',              border: neutral.err,  icon: '💤' };
    }
  })();
  return (
    <View style={[styles.statusCard, { borderColor: meta.border }]}>
      <View style={[styles.statusCardIcon, { backgroundColor: meta.dot + '20' }]}>
        <Text style={styles.statusCardIconGlyph}>{meta.icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.statusLabel} numberOfLines={1}>{meta.label}</Text>
        {detail ? <Text style={styles.statusDetail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {status === 'connecting' ? <ActivityIndicator size="small" color={meta.dot} /> : null}
      <Text style={[styles.statusSparkle, { color: accent.accent.fg }]}>
        {status === 'running' ? '⚡' : status === 'idle' ? '♡' : '✦'}
      </Text>
    </View>
  );
};

// ─── Falling petals (ambient) ───────────────────────────────────────────────

/**
 * FallingPetals — 6 cherry-blossom petals drifting downward around
 * the hero illustration. Each petal starts at a different
 * horizontal offset, with its own duration and starting delay.
 * They wrap from -60 to hero height + 60 so the loop is seamless.
 */
const FallingPetals: React.FC = () => {
  const petals = useRef(
    Array.from({ length: 6 }).map((_, i) => ({
      x: -100 + i * 40 + (i % 2) * 18,
      delay: i * 380,
      duration: 5500 + (i % 3) * 700,
      drift: ((i * 17) % 30) - 15,
      size: 12 + (i % 3) * 3,
      glyph: i % 2 === 0 ? '🌸' : '✿',
    })),
  ).current;
  return (
    <View pointerEvents="none" style={petalStyles.layer}>
      {petals.map((p, i) => (
        <FallingPetal key={i} {...p} />
      ))}
    </View>
  );
};

const FallingPetal: React.FC<{ x: number; delay: number; duration: number; drift: number; size: number; glyph: string }> = ({ x, delay, duration, drift, size, glyph }) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, duration, delay]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, 280] });
  const translateX = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, drift / 2] });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.8, 0.7, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + drift * 4}deg`] });
  return (
    <Animated.Text
      style={[
        petalStyles.petal,
        {
          left: x,
          fontSize: size,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }],
        },
      ]}
    >
      {glyph}
    </Animated.Text>
  );
};

const petalStyles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  petal: { position: 'absolute', top: 0 },
});

// ─── Sparkle ring (re-used from earlier phase) ─────────────────────────────

const SparkleRing: React.FC<{ color: string; count?: number }> = ({ color, count = 6 }) => {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { transform: [{ rotate }] }]}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 80;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const glyph = i % 2 === 0 ? '✦' : '✧';
        return (
          <Text
            key={i}
            style={[styles.ringSparkle, { color, transform: [{ translateX: x }, { translateY: y }, { rotate: `${-(i / count) * 360}deg` }] }]}
          >
            {glyph}
          </Text>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  contentContainer: { paddingBottom: 80 },
  narrow: { paddingHorizontal: space.md, paddingTop: space.md },
  wide:   { paddingHorizontal: 40,   paddingTop: 40, alignItems: 'center' },

  heroWrap: { alignItems: 'center', marginBottom: space.lg, position: 'relative' },
  heroImageBox: {
    width: 220, height: 220, borderRadius: 24,
    borderWidth: 1, padding: 0, marginBottom: space.md,
    overflow: 'hidden',
    backgroundColor: '#FFE4EC',  // soft pink wash so the white PNG edges blend
    shadowColor: '#FFB6C1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  heroImage: { width: '100%', height: '100%', borderRadius: 24, resizeMode: 'cover' },
  heroTitle: { ...type.hero, color: neutral.ink, fontSize: 26, marginBottom: 2 },
  heroSubtitle: { ...type.body, color: neutral.inkSoft, marginBottom: 4, textAlign: 'center' },
  heroHint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center' },

  ring: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  ringSparkle: { position: 'absolute', fontSize: 14, opacity: 0.7 },

  remoteHint: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    padding: space.sm, borderRadius: radius.md,
    borderWidth: 1, marginBottom: space.sm,
  },
  remoteHintEmoji: { fontSize: 18 },
  remoteHintText: { ...type.body, fontSize: 12, flex: 1 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    padding: space.sm, borderRadius: radius.md, borderWidth: 1,
    marginBottom: space.md, backgroundColor: neutral.surface,
  },
  statusDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusCardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  statusCardIconGlyph: { fontSize: 18 },
  statusLabel: { ...type.uiBold, color: neutral.ink, fontSize: 13 },
  statusDetail: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  statusSparkle: { fontSize: 16, marginLeft: 'auto' },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actionCard: {
    width: '48%', padding: space.sm,
    backgroundColor: neutral.surface, borderWidth: 1, borderColor: neutral.border,
    borderRadius: radius.md, alignItems: 'flex-start',
  },
  actionPressed: { backgroundColor: neutral.surfaceMuted },
  actionIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionEmoji: { fontSize: 18 },
  actionLabel: { ...type.uiBold, color: neutral.ink, fontSize: 13 },
  actionHint: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
});
