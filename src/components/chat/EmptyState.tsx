import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { palette, type, space } from '../../theme';
import { isNarrow } from '../../utils/platform';

export interface EmptyStateProps {
  /** Called when user taps a suggested prompt */
  onPick: (prompt: string) => void;
}

const SUGGESTIONS: { title: string; body: string; emoji: string }[] = [
  { title: 'Explain a concept', body: 'Explain how TCP congestion control works, as if I were new to networking.', emoji: '🧠' },
  { title: 'Write some code', body: 'Write a Python script that flattens a nested dict into dot-paths.', emoji: '💻' },
  { title: 'Brainstorm names', body: 'Brainstorm 10 names for a Win95-styled anime chatbot app.', emoji: '✨' },
  { title: 'Summarize', body: 'Summarize the difference between WebSockets and Server-Sent Events in 5 bullets.', emoji: '📝' },
];

/**
 * Welcome screen — shown when the active conversation is empty (or has only
 * the system welcome message). Renders a hero with mascot + suggested prompts
 * that fill the composer on tap.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ onPick }) => {
  const narrow = isNarrow;
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.mascot}>
          <Text style={styles.mascotEmoji}>🌸</Text>
        </View>
        <Text style={styles.heroTitle}>Hermes</Text>
        <Text style={styles.heroSubtitle}>
          跟你的 agent 助手聊一聊
        </Text>
        <Text style={styles.heroHint}>
          {narrow ? '挑一个建议，或直接输入' : 'Pick a suggestion, or type your own message below.'}
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
  hero: { alignItems: 'center', marginBottom: space.lg },
  mascot: {
    width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surface,
    borderTopWidth: 2, borderLeftWidth: 2, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 2, borderBottomWidth: 2, borderRightColor: palette.bevelLo, borderBottomColor: palette.bevelLo,
    marginBottom: space.md,
  },
  mascotEmoji: { fontSize: 56 },
  heroTitle: { ...type.hero, color: palette.ink, fontSize: 28, marginBottom: 4 },
  heroSubtitle: { ...type.body, color: palette.inkSoft, marginBottom: 8 },
  heroHint: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic' },

  suggestions: { gap: 8 },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, backgroundColor: palette.surface,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelLo, borderBottomColor: palette.bevelLo,
  },
  suggestionPressed: {
    borderTopColor: palette.bevelLo, borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi, borderBottomColor: palette.bevelHi,
  },
  suggestionEmoji: { fontSize: 24 },
  suggestionTitle: { ...type.uiBold, color: palette.ink, marginBottom: 2 },
  suggestionBody: { ...type.ui, color: palette.inkSoft },
});
