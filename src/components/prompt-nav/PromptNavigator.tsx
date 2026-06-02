import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { palette, type, space, bevel } from '../../theme';
import { useAppStore } from '../../store/app';
import { TextField, Button, Panel } from '../win95';

export interface PromptNavigatorProps {
  onInsertPrompt?: (body: string) => void;
  /** When true, the navigator renders edge-to-edge with no fixed width / outer bevel. */
  embedded?: boolean;
}

export const PromptNavigator: React.FC<PromptNavigatorProps> = ({ onInsertPrompt, embedded = false }) => {
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
    // pinned first, then by lastUsedAt (recent), then by createdAt
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
    <View style={embedded ? styles.rootEmbedded : [styles.root, bevel.raised, { backgroundColor: palette.surface }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📝 Prompts</Text>
        {!adding ? (
          <Button label="+ New" small onPress={() => setAdding(true)} />
        ) : (
          <Button label="× Cancel" small onPress={() => setAdding(false)} />
        )}
      </View>

      {adding ? (
        <View style={[styles.addBox, bevel.sunken]}>
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
                {p.pinned ? '📌 ' : ''}{p.title}
              </Text>
              <Pressable hitSlop={8} onPress={() => togglePin(p.id)}>
                <Text style={styles.pinBtn}>{p.pinned ? '★' : '☆'}</Text>
              </Pressable>
            </View>
            <Text numberOfLines={2} style={styles.itemBody}>
              {p.body}
            </Text>
            <View style={styles.itemMeta}>
              {p.category ? <Text style={styles.itemTag}>{p.category}</Text> : null}
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
  root: { width: 260, padding: 4 },
  rootEmbedded: { flex: 1, padding: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 4 },
  title: { ...type.uiBold, color: palette.ink },
  addBox: { backgroundColor: palette.surface, margin: 4, padding: 6 },
  field: { marginVertical: 2 },
  list: { flex: 1 },
  listContent: { padding: 4, paddingBottom: 12 },
  item: {
    backgroundColor: palette.paper,
    padding: 6,
    marginBottom: 4,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: palette.bevelHi,
    borderRightColor: palette.bevelDark,
    borderBottomColor: palette.bevelDark,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  itemPressed: {
    borderTopColor: palette.bevelDark,
    borderLeftColor: palette.bevelDark,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { ...type.uiBold, color: palette.ink, flex: 1 },
  pinBtn: { ...type.ui, color: palette.ink, marginLeft: 4 },
  itemBody: { ...type.ui, color: palette.inkSoft, marginTop: 2 },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  itemTag: { ...type.ui, color: palette.inkBlue, fontStyle: 'italic' },
  itemStat: { ...type.ui, color: palette.inkMuted },
  empty: { ...type.ui, color: palette.inkMuted, textAlign: 'center', padding: 12, fontStyle: 'italic' },
  hint: { ...type.ui, color: palette.inkMuted, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
});
