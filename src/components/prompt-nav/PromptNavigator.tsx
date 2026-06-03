import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { useAppStore } from '../../store/app';
import { TextField, Button } from '../win95';

export interface PromptNavigatorProps {
  onInsertPrompt?: (body: string) => void;
  /** When true, the navigator renders edge-to-edge with no fixed width. */
  embedded?: boolean;
}

export const PromptNavigator: React.FC<PromptNavigatorProps> = ({ onInsertPrompt, embedded = false }) => {
  const accent = useTheme();
  const prompts = useAppStore((s) => s.prompts);
  const order = useAppStore((s) => s.promptOrder);
  const usePrompt = useAppStore((s) => s.usePrompt);
  const addPrompt = useAppStore((s) => s.addPrompt);
  const deletePrompt = useAppStore((s) => s.deletePrompt);
  const togglePin = useAppStore((s) => s.togglePinPrompt);

  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] = useState('');

  const sorted = [...order].map((id) => prompts[id]).filter(Boolean).sort((a, b) => {
    if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    const la = a.lastUsedAt ?? a.createdAt;
    const lb = b.lastUsedAt ?? b.createdAt;
    return lb - la;
  });

  const onAdd = () => {
    if (!draftTitle.trim() || !draftBody.trim()) return;
    addPrompt({ title: draftTitle.trim(), body: draftBody.trim(), category: draftCategory.trim() || undefined });
    setDraftTitle('');
    setDraftBody('');
    setDraftCategory('');
    setAdding(false);
  };

  return (
    <View style={embedded ? styles.rootEmbedded : styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Prompts</Text>
        {!adding ? (
          <Pressable onPress={() => setAdding(true)} hitSlop={6}>
            <Text style={[styles.headerLink, { color: accent.accent.fg }]}>+ New</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setAdding(false)} hitSlop={6}>
            <Text style={styles.headerLinkMuted}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {adding ? (
        <View style={styles.addBox}>
          <TextField
            label="Title"
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="e.g. Summarize a paper"
            containerStyle={styles.field}
          />
          <TextField
            label="Body (use {{var}} for placeholders)"
            value={draftBody}
            onChangeText={setDraftBody}
            placeholder="Summarize this:\n\n{{text}}"
            multiline
            containerStyle={styles.field}
          />
          <TextField
            label="Category (optional)"
            value={draftCategory}
            onChangeText={setDraftCategory}
            placeholder="Coding / Reading / …"
            containerStyle={styles.field}
          />
          <View style={{ alignItems: 'flex-end' }}>
            <Button label="Save" default small onPress={onAdd} />
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {sorted.map((p) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
            onPress={() => {
              usePrompt(p.id);
              onInsertPrompt?.(p.body);
            }}
            onLongPress={() => deletePrompt(p.id)}
          >
            <View style={styles.itemHeader}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {p.pinned ? '★ ' : ''}{p.title}
              </Text>
              <Pressable hitSlop={8} onPress={() => togglePin(p.id)}>
                <Text style={[styles.pinBtn, p.pinned ? { color: accent.accent.fg } : null]}>
                  {p.pinned ? '★' : '☆'}
                </Text>
              </Pressable>
            </View>
            <Text numberOfLines={2} style={styles.itemBody}>
              {p.body}
            </Text>
            <View style={styles.itemMeta}>
              {p.category ? <Text style={[styles.itemTag, { color: accent.accent.fg }]}>{p.category}</Text> : null}
              <Text style={styles.itemStat}>
                {p.usageCount > 0 ? `used ${p.usageCount}×` : 'unused'}
              </Text>
            </View>
          </Pressable>
        ))}
        {sorted.length === 0 ? (
          <Text style={styles.empty}>No prompts yet. Tap "+ New" to add one.</Text>
        ) : null}
        <Text style={styles.hint}>Tap to insert · long-press to delete</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { width: 280, padding: space.sm },
  rootEmbedded: { flex: 1, padding: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.xs, marginBottom: space.xs },
  title: { ...type.title, color: neutral.ink, fontSize: 14 },
  headerLink: { ...type.caption, fontWeight: '600' },
  headerLinkMuted: { ...type.caption, color: neutral.inkMuted },
  addBox: { backgroundColor: neutral.surface, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border, marginBottom: space.sm },
  field: { marginVertical: space.xxs },
  list: { flex: 1 },
  listContent: { paddingBottom: space.md },
  item: {
    backgroundColor: neutral.surface,
    padding: space.sm,
    marginBottom: space.xs,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  itemPressed: { backgroundColor: neutral.surfaceMuted },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { ...type.uiBold, color: neutral.ink, flex: 1 },
  pinBtn: { ...type.caption, color: neutral.inkMuted, marginLeft: 4 },
  itemBody: { ...type.caption, color: neutral.inkSoft, marginTop: 2 },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  itemTag: { ...type.caption, fontStyle: 'italic' },
  itemStat: { ...type.caption, color: neutral.inkMuted },
  empty: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', padding: space.md, fontStyle: 'italic' },
  hint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', marginTop: space.sm, fontStyle: 'italic' },
});
