/**
 * ApprovalModal — surfaces a Hermes agent's approval.required event as a
 * blocking prompt the user can approve, deny, or annotate.
 *
 * The Hermes gateway emits `approval.required` over /v1/runs/{run_id}/events
 * when the agent wants to perform a tool the user gated behind a manual
 * confirm step. We translate that into a modal here.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../theme';

export interface ApprovalModalProps {
  open: boolean;
  runId: string | null;
  approvalId: string | null;
  prompt: string;
  tool: string;
  args: unknown;
  onResolve: (decision: 'approve' | 'deny', note?: string) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  open, runId, approvalId, prompt, tool, args, onResolve,
}) => {
  const accent = useTheme();
  const [note, setNote] = useState('');

  if (!open || !runId || !approvalId) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => onResolve('deny')}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onResolve('deny')} />
      </View>
      <View style={[styles.card, { borderColor: accent.accent.fg }]}>
        <Text style={styles.title}>⚠ Agent wants permission</Text>
        <Text style={styles.subtitle}>
          Hermes is asking to run a tool on your behalf. Review the details
          below and decide whether to allow it.
        </Text>

        <View style={[styles.metaRow, { backgroundColor: neutral.surfaceMuted }]}>
          <Text style={styles.metaLabel}>Run</Text>
          <Text style={styles.metaValue} numberOfLines={1}>{runId}</Text>
        </View>
        <View style={[styles.metaRow, { backgroundColor: neutral.surfaceMuted }]}>
          <Text style={styles.metaLabel}>Tool</Text>
          <Text style={styles.metaValue}>{tool}</Text>
        </View>
        <Text style={styles.promptLabel}>Prompt</Text>
        <ScrollView style={styles.promptBox}>
          <Text style={styles.promptText}>{prompt || '(no prompt text)'}</Text>
        </ScrollView>

        <Text style={styles.argsLabel}>Arguments</Text>
        <ScrollView style={styles.argsBox}>
          <Text style={styles.argsText} numberOfLines={6}>
            {args ? JSON.stringify(args, null, 2) : '(none)'}
          </Text>
        </ScrollView>

        <Text style={styles.noteLabel}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. only if the URL points at example.com"
          placeholderTextColor={neutral.inkMuted}
          multiline
          style={styles.noteInput}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => onResolve('deny', note.trim() || undefined)}
            style={({ pressed }) => [
              styles.btn, styles.btnDeny,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={styles.btnDenyText}>Deny ✕</Text>
          </Pressable>
          <Pressable
            onPress={() => onResolve('approve', note.trim() || undefined)}
            style={({ pressed }) => [
              styles.btn, { backgroundColor: accent.accent.fg, borderColor: accent.accent.fg },
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={styles.btnApproveText}>Approve ✓</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  card: {
    margin: 20, padding: space.md, backgroundColor: neutral.surface,
    borderRadius: radius.lg, borderWidth: 2, alignSelf: 'center', maxWidth: 480, width: '100%',
  },
  title: { ...type.title, color: neutral.ink, fontSize: 18, marginBottom: 4 },
  subtitle: { ...type.caption, color: neutral.inkMuted, marginBottom: space.sm, lineHeight: 16 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: space.xs, borderRadius: radius.sm, marginBottom: 4,
  },
  metaLabel: { ...type.caption, color: neutral.inkMuted, width: 50, fontWeight: '600' },
  metaValue: { ...type.caption, color: neutral.ink, flex: 1, fontFamily: 'Courier' },
  promptLabel: { ...type.caption, color: neutral.inkMuted, marginTop: space.sm, fontWeight: '600' },
  promptBox: {
    backgroundColor: neutral.bg, padding: space.xs, borderRadius: radius.sm, maxHeight: 100,
    borderWidth: 1, borderColor: neutral.border,
  },
  promptText: { ...type.body, color: neutral.ink, fontSize: 13 },
  argsLabel: { ...type.caption, color: neutral.inkMuted, marginTop: space.sm, fontWeight: '600' },
  argsBox: {
    backgroundColor: neutral.bg, padding: space.xs, borderRadius: radius.sm, maxHeight: 100,
    borderWidth: 1, borderColor: neutral.border,
  },
  argsText: { ...type.code, color: neutral.ink, fontSize: 11 },
  noteLabel: { ...type.caption, color: neutral.inkMuted, marginTop: space.sm, fontWeight: '600' },
  noteInput: {
    ...type.body, color: neutral.ink, backgroundColor: neutral.bg, padding: space.xs,
    borderRadius: radius.sm, borderWidth: 1, borderColor: neutral.border, minHeight: 60, textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: space.md },
  btn: {
    paddingHorizontal: space.md, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1, minWidth: 100, alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDeny: { backgroundColor: neutral.surface, borderColor: neutral.border },
  btnDenyText: { ...type.uiBold, color: neutral.err },
  btnApproveText: { ...type.uiBold, color: '#fff' },
});
