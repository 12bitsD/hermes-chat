import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  Modal, Animated, Platform, StatusBar, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, type, space, bevel } from '../theme';
import { Button, Panel } from '../components/win95';
import { ChatView } from '../components/chat/ChatView';
import { PromptNavigator } from '../components/prompt-nav/PromptNavigator';
import { useAppStore } from '../store/app';
import { isNarrow, isAndroid, isNative, watchScreen } from '../utils/platform';
import { haptic } from '../utils/haptic';

export const MainScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const conversations = useAppStore((s) => s.conversations);
  const order = useAppStore((s) => s.conversationOrder);
  const activeId = useAppStore((s) => s.activeConversationId);
  const setActive = useAppStore((s) => s.setActiveConversation);
  const createConv = useAppStore((s) => s.createConversation);
  const renameConv = useAppStore((s) => s.renameConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);
  const clearMessages = useAppStore((s) => s.clearMessages);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrow);

  // Watch for size changes (rotate, foldable, etc.)
  useEffect(() => {
    return watchScreen((win) => setNarrow(win.width < 768));
  }, []);

  // Close drawer on active conversation change (mobile only)
  useEffect(() => {
    if (narrow) setDrawerOpen(false);
  }, [activeId, narrow]);

  const active = activeId ? conversations[activeId] : null;

  return (
    <View style={[styles.root, { paddingTop: isNative ? insets.top : 0 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.surface} />

      {/* ── Top app bar — mobile / universal ────────────────────────────── */}
      <View style={[styles.appBar, bevel.raisedThin]}>
        {narrow ? (
          <Pressable hitSlop={12} onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>☰</Text>
          </Pressable>
        ) : null}

        {editingTitle && activeId ? (
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            onSubmitEditing={() => { if (draftTitle.trim()) renameConv(activeId, draftTitle.trim()); setEditingTitle(false); }}
            onBlur={() => setEditingTitle(false)}
            style={styles.titleInput}
            autoFocus
            placeholder="Session title"
            placeholderTextColor={palette.inkMuted}
          />
        ) : (
          <Pressable
            style={styles.titlePress}
            onPress={() => { if (active) { haptic('light'); setDraftTitle(active.title); setEditingTitle(true); } }}
          >
            <Text numberOfLines={1} style={styles.appBarTitle}>{active?.title ?? 'Hermes'}</Text>
            <Text numberOfLines={1} style={styles.appBarSubtitle}>
              {narrow ? 'tap to rename' : `${Object.keys(conversations).length} sessions · tap to rename`}
            </Text>
          </Pressable>
        )}

        <View style={styles.appBarRight}>
          {narrow ? (
            <Pressable hitSlop={12} onPress={() => setPromptsOpen(true)} style={styles.iconBtn}>
              <Text style={styles.iconBtnText}>✨</Text>
            </Pressable>
          ) : null}
          <Pressable hitSlop={12} onPress={() => { haptic('medium'); createConv(); }} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: palette.ink }]}>＋</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {narrow ? (
        // Mobile: chat fills the screen
        <View style={styles.mobileBody}>
          <ChatView />
        </View>
      ) : (
        // Desktop / wide: three-pane window
        <DesktopLayout />
      )}

      {/* ── Mobile drawer (sessions) ────────────────────────────────────── */}
      {narrow ? (
        <SessionDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          conversations={conversations}
          order={order}
          activeId={activeId}
          onPick={(id) => { setActive(id); setDrawerOpen(false); }}
          onNew={() => { createConv(); setDrawerOpen(false); }}
          onDelete={(id) => deleteConv(id)}
          insets={insets}
        />
      ) : null}

      {/* ── Mobile prompts sheet ────────────────────────────────────────── */}
      {narrow ? (
        <PromptSheet
          open={promptsOpen}
          onClose={() => setPromptsOpen(false)}
          onInsertPrompt={(body) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('hermes:insert-prompt', { detail: body }));
            }
          }}
        />
      ) : null}
    </View>
  );
};

// ─── Desktop three-pane ──────────────────────────────────────────────────────

const DesktopLayout: React.FC = () => {
  const conversations = useAppStore((s) => s.conversations);
  const order = useAppStore((s) => s.conversationOrder);
  const activeId = useAppStore((s) => s.activeConversationId);
  const setActive = useAppStore((s) => s.setActiveConversation);
  const createConv = useAppStore((s) => s.createConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);
  const clearMessages = useAppStore((s) => s.clearMessages);

  return (
    <View style={styles.desktopBody}>
      {/* Left rail */}
      <View style={[styles.rail, bevel.inset, { backgroundColor: palette.surface }]}>
        <View style={styles.railHeader}>
          <Text style={styles.railTitle}>💬 Sessions</Text>
          <Button label="+" small onPress={() => createConv()} />
        </View>
        <ScrollView style={styles.railList} contentContainerStyle={{ padding: 2 }}>
          {order.map((id) => {
            const c = conversations[id];
            if (!c) return null;
            const isActive = id === activeId;
            return (
              <Pressable
                key={id}
                onPress={() => setActive(id)}
                onLongPress={() => deleteConv(id)}
                style={({ pressed }) => [
                  styles.railItem,
                  isActive ? styles.railItemActive : null,
                  pressed ? styles.railItemPressed : null,
                ]}
              >
                <Text numberOfLines={1} style={[styles.railItemText, isActive ? styles.railItemTextActive : null]}>
                  {c.title}
                </Text>
                <Text numberOfLines={1} style={[styles.railItemMeta, isActive ? styles.railItemTextActive : null]}>
                  {c.messages.length} msg · {timeAgo(c.updatedAt)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.railHint}>long-press to delete</Text>
      </View>

      {/* Center */}
      <View style={styles.desktopCenter}>
        <ChatView />
      </View>

      {/* Right prompt nav */}
      <View style={styles.desktopRight}>
        <PromptNavigator
          onInsertPrompt={(body) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('hermes:insert-prompt', { detail: body }));
            }
          }}
        />
      </View>
    </View>
  );
};

// ─── Mobile drawer (sessions) ────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: ReturnType<typeof useAppStore.getState>['conversations'];
  order: string[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  insets: { top: number; bottom: number; left: number; right: number };
}

const SessionDrawer: React.FC<DrawerProps> = ({ open, onClose, conversations, order, activeId, onPick, onNew, onDelete, insets }) => {
  const slideAnim = useRef(new Animated.Value(-1)).current; // -1 = closed, 0 = open

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: open ? 0 : -1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [open, slideAnim]);

  const translateX = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [-320, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [-1, 0], outputRange: [0, 0.4] });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          styles.drawerPanel,
          { transform: [{ translateX }], paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={[styles.drawerHeader, bevel.raisedThin]}>
          <Text style={styles.drawerTitle}>Sessions</Text>
          <Pressable hitSlop={12} onPress={onNew} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>＋</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 6 }}>
          {order.map((id) => {
            const c = conversations[id];
            if (!c) return null;
            const isActive = id === activeId;
            return (
              <Pressable
                key={id}
                onPress={() => onPick(id)}
                onLongPress={() => onDelete(id)}
                style={({ pressed }) => [
                  styles.drawerItem,
                  isActive ? styles.drawerItemActive : null,
                  pressed ? styles.drawerItemPressed : null,
                ]}
              >
                <Text numberOfLines={1} style={[styles.drawerItemText, isActive ? styles.drawerItemTextActive : null]}>
                  {c.title}
                </Text>
                <Text numberOfLines={1} style={[styles.drawerItemMeta, isActive ? styles.drawerItemTextActive : null]}>
                  {c.messages.length} msg · {timeAgo(c.updatedAt)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.drawerHint}>tap switch · long-press delete</Text>
      </Animated.View>
    </Modal>
  );
};

// ─── Mobile prompt sheet ─────────────────────────────────────────────────────

const PromptSheet: React.FC<{ open: boolean; onClose: () => void; onInsertPrompt: (body: string) => void }> = ({ open, onClose, onInsertPrompt }) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(1)).current; // 1 = hidden below, 0 = open

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: open ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slideAnim]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 600] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetPanel,
          { transform: [{ translateY }], paddingBottom: insets.bottom + 8, paddingTop: 8 },
        ]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>
        <PromptNavigator
          onInsertPrompt={(body) => { onInsertPrompt(body); onClose(); }}
          embedded
        />
      </Animated.View>
    </Modal>
  );
};

// ─── Time helper ─────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },

  // App bar (mobile + desktop fallback)
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  appBarTitle: { ...type.title, color: palette.ink },
  appBarSubtitle: { ...type.ui, color: palette.inkMuted, fontSize: 10 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  iconBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surface, borderRadius: 0,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelLo, borderBottomColor: palette.bevelLo,
  },
  iconBtnText: { fontSize: 20, color: palette.ink, lineHeight: 22 },
  titlePress: { flex: 1, minWidth: 0 },
  titleInput: {
    flex: 1, ...type.body, color: palette.ink, backgroundColor: palette.paper,
    paddingHorizontal: 4, paddingVertical: 2, minHeight: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelLo, borderLeftColor: palette.bevelLo,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelHi, borderBottomColor: palette.bevelHi,
  },

  // Mobile body
  mobileBody: { flex: 1 },

  // Desktop
  desktopBody: { flex: 1, flexDirection: 'row' },
  desktopCenter: { flex: 1 },
  desktopRight: { width: 280, marginLeft: 4, marginRight: 4, marginVertical: 4 },

  rail: { width: 220, marginLeft: 4, marginVertical: 4 },
  railHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 4 },
  railTitle: { ...type.uiBold, color: palette.ink },
  railList: { flex: 1 },
  railItem: { paddingHorizontal: 6, paddingVertical: 4, marginVertical: 1, backgroundColor: palette.surface },
  railItemActive: { backgroundColor: palette.inkBlue },
  railItemPressed: { backgroundColor: palette.titlebarActive },
  railItemText: { ...type.ui, color: palette.ink },
  railItemTextActive: { color: palette.titlebarActiveText },
  railItemMeta: { ...type.ui, color: palette.inkMuted, fontSize: 9 },
  railHint: { ...type.ui, color: palette.inkMuted, textAlign: 'center', padding: 4, fontStyle: 'italic' },

  // Mobile drawer
  drawerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  drawerPanel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 320, maxWidth: '85%',
    backgroundColor: palette.canvas, borderRightWidth: 2, borderRightColor: palette.bevelDark,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 8, marginBottom: 6, backgroundColor: palette.surface,
  },
  drawerTitle: { ...type.title, color: palette.ink },
  drawerItem: { paddingHorizontal: 10, paddingVertical: 10, marginVertical: 2, backgroundColor: palette.surface, borderRadius: 0 },
  drawerItemActive: { backgroundColor: palette.inkBlue },
  drawerItemPressed: { backgroundColor: palette.titlebarActive },
  drawerItemText: { ...type.body, color: palette.ink },
  drawerItemTextActive: { color: palette.titlebarActiveText },
  drawerItemMeta: { ...type.ui, color: palette.inkMuted, fontSize: 10, marginTop: 2 },
  drawerHint: { ...type.ui, color: palette.inkMuted, textAlign: 'center', padding: 8, fontStyle: 'italic' },

  // Mobile sheet (prompts)
  sheetPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 540, maxHeight: '80%',
    backgroundColor: palette.canvas, borderTopWidth: 2, borderTopColor: palette.bevelDark,
  },
  sheetHandleWrap: { alignItems: 'center', paddingBottom: 6 },
  sheetHandle: { width: 40, height: 4, backgroundColor: palette.bevelDark, borderRadius: 2 },
});
