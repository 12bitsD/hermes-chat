import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Animated } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import type { Conversation } from '../../types';
import { timeAgo } from '../../utils/time';

export interface SessionDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPickRemote?: (id: string) => void;
  remoteSessions?: { id: string; title?: string; messageCount?: number; updatedAt?: number }[];
  remoteJobs?: { id: string }[];
  remoteSkills?: { id: string }[];
  remoteGatewayReachable: boolean;
  insets: { top: number; bottom: number; left: number; right: number };
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  open, onClose, conversations, order, activeId,
  onPick, onNew, onDelete, onPickRemote,
  remoteSessions, remoteJobs, remoteSkills, remoteGatewayReachable,
  insets,
}) => {
  const accent = useTheme();
  const slideAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: open ? 0 : -1, duration: 200, useNativeDriver: true }).start();
  }, [open, slideAnim]);

  const translateX = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [-340, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [0, 0.4] });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawerPanel,
          { transform: [{ translateX }], paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Sessions</Text>
          <Pressable
            hitSlop={8}
            onPress={onNew}
            style={({ pressed }) => [styles.newChatBtn, pressed ? styles.newChatBtnPressed : null]}
          >
            <Text style={styles.newChatPlus}>＋</Text>
          </Pressable>
        </View>

        {remoteSessions ? (
          <View style={styles.dashStrip}>
            <Text style={styles.dashStripText} numberOfLines={1}>
              <Text style={styles.dashEmoji}>📡</Text>{' '}
              <Text style={styles.dashCount}>{remoteSessions.length}</Text> sessions
              {remoteJobs ? <> · <Text style={styles.dashEmoji}>📋</Text>{' '}<Text style={styles.dashCount}>{remoteJobs.length}</Text> jobs</> : null}
              {remoteSkills ? <> · <Text style={styles.dashEmoji}>✨</Text>{' '}<Text style={styles.dashCount}>{remoteSkills.length}</Text> skills</> : null}
            </Text>
          </View>
        ) : null}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.sm }}>
          {remoteSessions && remoteSessions.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.drawerSectionHeader, { color: accent.accent.fg }]}>
                📡 Hermes (remote)
              </Text>
              {remoteSessions.map((session) => (
                <Pressable
                  key={`remote:${session.id}`}
                  onPress={() => onPickRemote?.(session.id)}
                  style={({ pressed }) => [
                    styles.drawerItem,
                    styles.drawerItemRemote,
                    pressed ? styles.drawerItemPressed : null,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.drawerItemText}>
                    🖥 {session.title || session.id}
                  </Text>
                  <Text numberOfLines={1} style={styles.drawerItemMeta}>
                    {session.messageCount != null ? `${session.messageCount} msg` : '—'} · {session.updatedAt ? timeAgo(session.updatedAt) : '—'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.drawerSectionHeader}>📱 This device</Text>
          {order.map((id) => {
            const conversation = conversations[id];
            if (!conversation) return null;
            const isActive = id === activeId;
            return (
              <Pressable
                key={id}
                onPress={() => onPick(id)}
                onLongPress={() => onDelete(id)}
                style={({ pressed }) => [
                  styles.drawerItem,
                  isActive ? [styles.drawerItemActive, { backgroundColor: accent.accent.soft }] : null,
                  pressed ? styles.drawerItemPressed : null,
                ]}
              >
                <Text numberOfLines={1} style={[styles.drawerItemText, isActive ? styles.drawerItemTextActive : null]}>
                  {conversation.title}
                </Text>
                <Text numberOfLines={1} style={[styles.drawerItemMeta, isActive ? styles.drawerItemTextActive : null]}>
                  {conversation.messages.length} msg · {timeAgo(conversation.updatedAt)}
                </Text>
              </Pressable>
            );
          })}
          {order.length === 0 ? (
            <Text style={styles.drawerHint}>
              {remoteGatewayReachable
                ? 'No local sessions. Tap a remote one above to import it.'
                : 'No sessions yet. Tap + New to start one.'}
            </Text>
          ) : null}
        </ScrollView>
        <Text style={styles.drawerHint}>Tap switch · long-press delete</Text>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  drawerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  drawerPanel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 320, maxWidth: '85%',
    backgroundColor: neutral.surface, borderRightWidth: 1, borderRightColor: neutral.border,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingBottom: space.sm, marginBottom: space.xs,
  },
  dashStrip: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    backgroundColor: neutral.surfaceMuted,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: neutral.border, borderBottomColor: neutral.border,
  },
  dashStripText: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10 },
  dashEmoji: { fontSize: 11 },
  dashCount: { ...type.uiBold, color: '#007AFF', fontFamily: 'Courier' },
  drawerTitle: { ...type.title, color: neutral.ink, fontSize: 17 },
  newChatBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FFD1DC', borderWidth: 1, borderColor: '#007AFF',
    alignItems: 'center', justifyContent: 'center',
  },
  newChatBtnPressed: { backgroundColor: '#007AFF' },
  newChatPlus: { fontSize: 18, color: '#007AFF', lineHeight: 18, fontWeight: '600', marginTop: -1 },
  drawerItem: { paddingHorizontal: space.md, paddingVertical: space.sm, marginVertical: 2, borderRadius: radius.sm },
  drawerItemActive: {},
  drawerItemPressed: { backgroundColor: neutral.surfaceMuted },
  drawerItemText: { ...type.bodyMd, color: neutral.ink, fontSize: 14 },
  drawerItemTextActive: { fontWeight: '600' },
  drawerItemMeta: { ...type.captionSm, color: neutral.inkMuted, marginTop: 2 },
  drawerSectionHeader: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, paddingBottom: 4, paddingTop: 2 },
  drawerItemRemote: { borderLeftWidth: 2, borderLeftColor: '#FBBF24' },
  drawerHint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', padding: space.sm, fontStyle: 'italic' },
});
