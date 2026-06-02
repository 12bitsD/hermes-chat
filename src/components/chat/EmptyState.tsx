import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { isNarrow } from '../../utils/platform';

export interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

const SUGGESTIONS: { title: string; body: string; emoji: string }[] = [
  { title: 'Explain a concept', body: 'Explain how TCP congestion control works, as if I were new to networking.', emoji: '🧠' },
  { title: 'Write some code', body: 'Write a Python script that flattens a nested dict into dot-paths.', emoji: '💻' },
  { title: 'Brainstorm names', body: 'Brainstorm 10 names for a minimalist AI chatbot app.', emoji: '✨' },
  { title: 'Summarize', body: 'Summarize the difference between WebSockets and Server-Sent Events in 5 bullets.', emoji: '📝' },
];

/**
 * Welcome screen — shown when the active conversation is empty. Renders a
 * hero with the app name + suggested prompts. Picks are funneled into the
 * composer.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ onPick }) => {
  const accent = useTheme();
  const narrow = isNarrow;
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={[styles.mascot, { backgroundColor: accent.accent.soft }]}>
          <Text style={styles.mascotEmoji}>🌸</Text>
        </View>
        <Text style={styles.heroTitle}>Hermes</Text>
        <Text style={styles.heroSubtitle}>A clean little chatbot for talking to your agent.</Text>
        <Text style={styles.heroHint}>
          {narrow ? 'Pick a suggestion, or type below.' : 'Pick a suggestion, or type your own message below.'}
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

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: space.xl },
  mascot: {
    width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center',
    marginBottom: space.md,
  },
  mascotEmoji: { fontSize: 44 },
  heroTitle: { ...type.hero, color: neutral.ink, fontSize: 28, marginBottom: 4 },
  heroSubtitle: { ...type.body, color: neutral.inkSoft, marginBottom: 6, textAlign: 'center' },
  heroHint: { ...type.caption, color: neutral.inkMuted },

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
