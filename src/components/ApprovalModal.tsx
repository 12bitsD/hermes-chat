/**
 * ApprovalModal — surfaces a Hermes agent's approval.required event as a
 * blocking prompt the user can approve or deny.
 *
 * The Hermes gateway emits `approval.required` over /v1/runs/{run_id}/events
 * when the agent wants to perform a tool the user gated behind a manual
 * confirm step. We translate that into a modal here.
 *
 * Phase 63 #10: This modal is now reserved for HIGH-RISK tools
 * (shell / write_file / delete_file / etc.). Low-risk tools
 * (read_file / web_search) use ApprovalToast instead — see
 * `domain/tools/risk.ts` and `toolRiskLevel()`.
 *
 * The previous version had a 'Note (optional)' input and a raw JSON
 * args dump. Both were removed: the modal now shows a one-line
 * human-readable intent (via `describeToolIntent`) and trusts the
 * user to read the prompt + the kawaii verbs (🌸 Allow / 🌧 Deny).
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../theme';
import { describeToolIntent } from '../domain/tools/risk';

export interface ApprovalModalProps {
  open: boolean;
  runId: string | null;
  approvalId: string | null;
  prompt: string;
  tool: string;
  args: unknown;
  onResolve: (decision: 'approve' | 'deny') => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  open, runId, approvalId, prompt, tool, args, onResolve,
}) => {
  const accent = useTheme();

  if (!open || !runId || !approvalId) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => onResolve('deny')}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onResolve('deny')} />
      </View>
      <View style={[styles.card, { borderColor: accent.accent.fg }]}>
        <Text style={styles.title}>⚠ Hermes wants to {tool.replace(/_/g, ' ')}</Text>
        <Text style={styles.subtitle}>
          This is a high-risk tool — review what it does, then allow or deny.
        </Text>

        <View style={[styles.metaRow, { backgroundColor: neutral.surfaceMuted }]}>
          <Text style={styles.metaLabel}>Tool</Text>
          <Text style={styles.metaValue}>{tool}</Text>
        </View>

        <Text style={styles.promptLabel}>What it does</Text>
        <ScrollView style={styles.promptBox}>
          <Text style={styles.promptText}>{describeToolIntent(tool, args)}</Text>
        </ScrollView>

        {prompt ? (
          <>
            <Text style={styles.promptLabel}>Hermes says</Text>
            <Text style={styles.quote}>{prompt}</Text>
          </>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => onResolve('deny')}
            style={({ pressed }) => [
              styles.btn, styles.btnDeny,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={styles.btnDenyText}>🌧 Deny</Text>
          </Pressable>
          <Pressable
            onPress={() => onResolve('approve')}
            style={({ pressed }) => [
              styles.btn, { backgroundColor: accent.accent.fg, borderColor: accent.accent.fg },
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={styles.btnApproveText}>🌸 Allow</Text>
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
  quote: {
    ...type.body, color: neutral.ink, fontSize: 12, fontStyle: 'italic',
    backgroundColor: neutral.bg, padding: space.xs, borderRadius: radius.sm,
    borderLeftWidth: 2, borderLeftColor: '#FFB6C1',
    marginTop: 4,
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
