import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Animated, TextInput } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import type { Conversation } from '../../types';
import { timeAgo } from '../../utils/time';
import { haptic } from '../../utils/haptic';

export interface SessionDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPickRemote?: (id: string) => void;
  remoteSessions?: { id: string; title?: string; messageCount?: number; updatedAt?: number }[];
  remoteJobs?: { id: string; title?: string; state?: string; nextRunAt?: number }[];
  remoteSkills?: { id: string }[];
  remoteToolsets?: { id: string; name?: string; tools?: string[] }[];
  remoteGatewayReachable: boolean;
  insets: { top: number; bottom: number; left: number; right: number };
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  open, onClose, conversations, order, activeId,
  onPick, onNew, onDelete, onPin, onRename, onPickRemote,
  remoteSessions, remoteJobs, remoteSkills, remoteToolsets, remoteGatewayReachable,
  insets,
}) => {
  const accent = useTheme();
  const slideAnim = useRef(new Animated.Value(-1)).current;
  type DrawerTab = 'sessions' | 'agent' | 'tools';
  const [tab, setTab] = useState<DrawerTab>('sessions');

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: open ? 0 : -1, duration: 200, useNativeDriver: true }).start();
  }, [open, slideAnim]);

  const translateX = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [-340, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [0, 0.4] });

  // Long-press menu state — which conversation's menu is open.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Sort order: pinned conversations first, then by updatedAt desc.
  // Within the pinned group, keep the existing order (which is
  // already set to put newly-pinned items at the head by the store).
  const sortedOrder = useMemo(() => {
    return [...order].sort((a, b) => {
      const ca = conversations[a];
      const cb = conversations[b];
      const ap = !!ca?.pinned;
      const bp = !!cb?.pinned;
      if (ap !== bp) return ap ? -1 : 1;
      return (cb?.updatedAt ?? 0) - (ca?.updatedAt ?? 0);
    });
  }, [order, conversations]);

  const menuConv = menuId ? conversations[menuId] : null;
  const renameConv = renameId ? conversations[renameId] : null;

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
          <Text style={styles.drawerTitle}>
            {tab === 'sessions' ? 'Sessions' : tab === 'agent' ? 'Agent' : 'Tools'}
          </Text>
          {tab === 'sessions' ? (
            <Pressable
              hitSlop={8}
              onPress={onNew}
              style={({ pressed }) => [styles.newChatBtn, pressed ? styles.newChatBtnPressed : null]}
            >
              <Text style={styles.newChatPlus}>＋</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Tab strip — Sessions / Agent / Tools. The decomp called
            for a 3-section drawer to make the agent itself visible
            as a primary surface (not just a chat list). */}
        <View style={styles.tabStrip}>
          {(['sessions', 'agent', 'tools'] as const).map((t) => {
            const label = t === 'sessions' ? '💬 Sessions' : t === 'agent' ? '⚡ Agent' : '🛠 Tools';
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { haptic('light'); setTab(t); }}
                style={({ pressed }) => [
                  styles.tabBtn,
                  active ? [styles.tabBtnActive, { backgroundColor: accent.accent.soft, borderColor: accent.accent.fg }] : null,
                  pressed ? styles.tabBtnPressed : null,
                ]}
              >
                <Text style={[styles.tabBtnText, active ? styles.tabBtnTextActive : null]}>{label}</Text>
              </Pressable>
            );
          })}
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

        {tab === 'sessions' ? (
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
          {sortedOrder.map((id) => {
            const conversation = conversations[id];
            if (!conversation) return null;
            const isActive = id === activeId;
            return (
              <Pressable
                key={id}
                onPress={() => onPick(id)}
                onLongPress={() => { haptic('light'); setMenuId(id); }}
                style={({ pressed }) => [
                  styles.drawerItem,
                  isActive ? [styles.drawerItemActive, { backgroundColor: accent.accent.soft }] : null,
                  pressed ? styles.drawerItemPressed : null,
                ]}
              >
                {conversation.pinned ? <Text style={styles.pinIndicator}>📌</Text> : null}
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
        ) : null}

        {/* ── Agent tab ──────────────────────────────────────────── */}
        {tab === 'agent' ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.sm }}>
            <Text style={styles.drawerSectionHeader}>⚡ Active runs</Text>
            <Text style={styles.drawerHint}>
              Long-running tools and background work on your computer will appear here. Phase 56 wires the run state for the current chat; this tab is the multi-chat view.
            </Text>
            <Text style={styles.drawerSectionHeader}>📋 Jobs</Text>
            {remoteJobs && remoteJobs.length > 0 ? (
              remoteJobs.map((j) => (
                <View key={j.id} style={styles.drawerItem}>
                  <Text numberOfLines={1} style={styles.drawerItemText}>
                    📋 {j.title || j.id}
                  </Text>
                  <Text numberOfLines={1} style={styles.drawerItemMeta}>
                    {j.state ?? 'unknown'}{j.nextRunAt ? ` · next ${timeAgo(j.nextRunAt * 1000)}` : ''}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.drawerHint}>
                {remoteGatewayReachable ? 'No background jobs.' : 'Gateway offline — job list unavailable.'}
              </Text>
            )}
            <Text style={styles.drawerSectionHeader}>✋ Pending approvals</Text>
            <Text style={styles.drawerHint}>
              0 pending. Approvals for the current chat arrive inline (see Phase 63 #10). Multi-chat approval inbox is a future P1.
            </Text>
          </ScrollView>
        ) : null}

        {/* ── Tools tab ──────────────────────────────────────────── */}
        {tab === 'tools' ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.sm }}>
            <Text style={styles.drawerSectionHeader}>🛠 Toolsets</Text>
            {remoteToolsets && remoteToolsets.length > 0 ? (
              remoteToolsets.map((ts) => (
                <View key={ts.id} style={styles.drawerItem}>
                  <Text numberOfLines={1} style={styles.drawerItemText}>
                    🛠 {ts.name || ts.id}
                  </Text>
                  <Text numberOfLines={1} style={styles.drawerItemMeta}>
                    {ts.tools?.length ? `${ts.tools.length} tools` : '—'}
                    {ts.tools?.slice(0, 4).map((t) => ` · ${t}`).join('') || ''}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.drawerHint}>
                {remoteGatewayReachable ? 'No toolsets reported by the gateway.' : 'Gateway offline — toolset list unavailable.'}
              </Text>
            )}
            <Text style={styles.drawerSectionHeader}>✨ Skills</Text>
            {remoteSkills && remoteSkills.length > 0 ? (
              <View style={styles.drawerItem}>
                <Text numberOfLines={1} style={styles.drawerItemText}>
                  {remoteSkills.length} skill{remoteSkills.length === 1 ? '' : 's'} available
                </Text>
                <Text numberOfLines={1} style={styles.drawerItemMeta}>
                  Open Settings to enable / configure
                </Text>
              </View>
            ) : (
              <Text style={styles.drawerHint}>
                {remoteGatewayReachable ? 'No skills installed.' : 'Gateway offline — skill list unavailable.'}
              </Text>
            )}
          </ScrollView>
        ) : null}

        <Text style={styles.drawerHint}>
          {tab === 'sessions' ? 'Tap switch · long-press menu' : tab === 'agent' ? 'Active work on your computer' : 'Tools your Hermes can call'}
        </Text>
      </Animated.View>

      {/* Long-press menu: a small bottom-sheet modal with 3 actions
          (Pin/Unpin, Rename, Delete). Replaces the previous long-
          press → delete behavior, since the user can now also pin
          and rename from the same gesture. */}
      <Modal visible={!!menuConv} transparent animationType="slide" onRequestClose={() => setMenuId(null)}>
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuId(null)} />
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle} numberOfLines={1}>{menuConv?.title ?? 'Session'}</Text>
            <Pressable
              onPress={() => { haptic('light'); if (menuId) { onPin(menuId); setMenuId(null); } }}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <Text style={styles.menuEmoji}>{menuConv?.pinned ? '📌' : '📍'}</Text>
              <Text style={styles.menuLabel}>{menuConv?.pinned ? 'Unpin' : 'Pin'}</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (menuId) { setRenameId(menuId); setRenameDraft(menuConv?.title ?? ''); setMenuId(null); } }}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <Text style={styles.menuEmoji}>✏️</Text>
              <Text style={styles.menuLabel}>Rename</Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic('warning'); if (menuId) { onDelete(menuId); setMenuId(null); } }}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <Text style={styles.menuEmoji}>🗑</Text>
              <Text style={[styles.menuLabel, styles.menuLabelDestructive]}>Delete</Text>
            </Pressable>
            <Pressable onPress={() => setMenuId(null)} style={styles.menuCancel}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Rename sheet: simple inline title editor. Save commits the
          rename and closes; cancel discards. */}
      <Modal visible={!!renameConv} transparent animationType="slide" onRequestClose={() => setRenameId(null)}>
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setRenameId(null)} />
          <View style={[styles.menuSheet, styles.renameSheet]}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Rename session</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              style={styles.renameInput}
              placeholder="Session title"
              placeholderTextColor={neutral.inkMuted}
              onSubmitEditing={() => {
                if (renameId && renameDraft.trim()) {
                  haptic('success');
                  onRename(renameId, renameDraft.trim());
                }
                setRenameId(null);
              }}
            />
            <View style={styles.renameRow}>
              <Pressable onPress={() => setRenameId(null)} style={[styles.renameBtn, styles.renameBtnGhost]}>
                <Text style={styles.renameBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (renameId && renameDraft.trim()) {
                    haptic('success');
                    onRename(renameId, renameDraft.trim());
                  }
                  setRenameId(null);
                }}
                style={[styles.renameBtn, styles.renameBtnPrimary]}
              >
                <Text style={styles.renameBtnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  tabStrip: { flexDirection: 'row', gap: 4, paddingHorizontal: space.sm, paddingBottom: space.sm },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  tabBtnActive: { borderWidth: 1 },
  tabBtnPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  tabBtnText: { ...type.caption, color: neutral.inkSoft, fontSize: 11, fontWeight: '500' },
  tabBtnTextActive: { fontWeight: '700' },
  pinIndicator: { fontSize: 12, marginRight: 4 },

  // Long-press menu sheet styles
  menuRoot: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  menuBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0006' },
  menuSheet: {
    backgroundColor: neutral.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.lg,
  },
  menuHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: neutral.border, alignSelf: 'center', marginBottom: space.sm },
  menuTitle: { ...type.title, color: neutral.ink, fontSize: 16, marginBottom: space.xs },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.sm,
  },
  menuItemPressed: { backgroundColor: neutral.surfaceMuted },
  menuEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { ...type.body, color: neutral.ink, fontSize: 15 },
  menuLabelDestructive: { color: '#DC2626' },
  menuCancel: {
    marginTop: space.sm, paddingVertical: 12,
    backgroundColor: neutral.surfaceMuted, borderRadius: radius.md, alignItems: 'center',
  },
  menuCancelText: { ...type.uiBold, color: neutral.ink, fontSize: 14 },

  // Rename sheet
  renameSheet: { gap: space.sm },
  renameInput: {
    ...type.body, color: neutral.ink, fontSize: 15,
    borderWidth: 1, borderColor: neutral.border, borderRadius: radius.md,
    paddingHorizontal: space.sm, paddingVertical: 10,
    backgroundColor: neutral.bg,
  },
  renameRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  renameBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  renameBtnGhost: { backgroundColor: neutral.surfaceMuted },
  renameBtnGhostText: { ...type.uiBold, color: neutral.ink, fontSize: 14 },
  renameBtnPrimary: { backgroundColor: '#FFB6C1' },
  renameBtnPrimaryText: { ...type.uiBold, color: '#fff', fontSize: 14 },
});
