import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated, Easing } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { isNarrow } from '../../utils/platform';

export interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

const SUGGESTIONS: { title: string; body: string; emoji: string }[] = [
  { title: 'Explain a concept ✨', body: 'Explain how TCP congestion control works, as if I were new to networking.', emoji: '🎀' },
  { title: 'Write some code (。•ω•)', body: 'Write a Python script that flattens a nested dict into dot-paths.', emoji: '💻' },
  { title: 'Brainstorm names ♡', body: 'Brainstorm 10 names for a minimalist AI chatbot app.', emoji: '🌸' },
  { title: 'Summarize', body: 'Summarize the difference between WebSockets and Server-Sent Events in 5 bullets.', emoji: '📖' },
];

/**
 * Welcome screen — shown when the active conversation is empty. Renders a
 * hero with the app mascot illustration + suggested prompts. Picks are
 * funneled into the composer.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ onPick }) => {
  const accent = useTheme();
  const narrow = isNarrow;
  return (
    <View style={styles.root}>
      {/* Hero with real anime mascot illustration */}
      <View style={styles.hero}>
        <SparkleRing color={accent.accent.fg} count={6} />
        <View style={[styles.mascotHalo, { borderColor: accent.accent.soft }]}>
          <Image
            source={require('../../../assets/illustrations/mascot.png')}
            style={styles.mascot}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.heroSparkleRight, { color: accent.accent.fg }]}>♡</Text>
        <Text style={styles.heroTitle}>🌸 Hermes</Text>
        <Text style={styles.heroSubtitle}>A clean little chatbot for talking to your agent ♡</Text>
        <Text style={styles.heroHint}>
          {narrow ? 'Pick a suggestion, or type below ♡' : 'Pick a suggestion, or type your own message below ♡'}
        </Text>
      </View>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => onPick(s.body)}
            style={({ pressed }) => [styles.suggestion, pressed ? styles.suggestionPressed : null]}
          >
            <Text style={styles.suggestionEmoji}>{s.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestionTitle}>{s.title}</Text>
              <Text style={styles.suggestionBody} numberOfLines={3}>{s.body}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

/**
 * SparkleRing — 6 ✦ / ✧ characters rotating slowly around a circular
 * hero. Each is offset by 60° and bobs in/out. Pure ambient
 * decoration; pointerEvents none so it never blocks the tap target
 * underneath (the mascot itself).
 */
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
      style={[
        styles.ring,
        { transform: [{ rotate }] },
      ]}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 92;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const glyph = i % 2 === 0 ? '✦' : '✧';
        return (
          <Text
            key={i}
            style={[
              styles.ringSparkle,
              {
                color,
                transform: [{ translateX: x }, { translateY: y }, { rotate: `${-(i / count) * 360}deg` }],
              },
            ]}
          >
            {glyph}
          </Text>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: space.xl, position: 'relative' },
  mascotHalo: {
    width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center',
    marginBottom: space.md, borderWidth: 2, padding: 6, backgroundColor: neutral.surface,
  },
  mascot: { width: '100%', height: '100%', borderRadius: 64 },
  heroSparkleLeft: { position: 'absolute', top: 0, left: 12, fontSize: 20, opacity: 0.7 },
  heroSparkleRight: { position: 'absolute', top: 0, right: 12, fontSize: 20, opacity: 0.7 },
  heroTitle: { ...type.hero, color: neutral.ink, fontSize: 28, marginBottom: 4 },
  heroSubtitle: { ...type.body, color: neutral.inkSoft, marginBottom: 6, textAlign: 'center' },
  heroHint: { ...type.caption, color: neutral.inkMuted },

  ring: {
    position: 'absolute', top: '50%', left: '50%',
    width: 0, height: 0, alignItems: 'center', justifyContent: 'center',
  },
  ringSparkle: { position: 'absolute', fontSize: 16, opacity: 0.7 },

  suggestions: { gap: space.xs },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    padding: space.sm, backgroundColor: neutral.surface,
    borderWidth: 1, borderColor: neutral.border, borderRadius: radius.md,
  },
  suggestionPressed: { backgroundColor: neutral.surfaceMuted },
  suggestionEmoji: { fontSize: 22 },
  suggestionTitle: { ...type.uiBold, color: neutral.ink, marginBottom: 2 },
  suggestionBody: { ...type.caption, color: neutral.inkSoft },
});
