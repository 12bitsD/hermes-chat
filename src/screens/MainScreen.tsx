import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  Modal, Animated, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, useTheme } from '../theme';
import { ChatView } from '../components/chat/ChatView';
import { PromptNavigator } from '../components/prompt-nav/PromptNavigator';
import { SettingsPanel } from '../components/SettingsPanel';
import { SakuraRain } from '../components/SakuraRain';
import { useAppStore } from '../store/app';
import { getLLMClient } from '../store/persistence';
import { isNarrow, isNative, watchScreen } from '../utils/platform';
import { haptic } from '../utils/haptic';

export const MainScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const accent = useTheme();
  const conversations = useAppStore((s) => s.conversations);
  const order = useAppStore((s) => s.conversationOrder);
  const activeId = useAppStore((s) => s.activeConversationId);
  const setActive = useAppStore((s) => s.setActiveConversation);
  const createConv = useAppStore((s) => s.createConversation);
  const renameConv = useAppStore((s) => s.renameConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrow);

  useEffect(() => {
    return watchScreen((win) => setNarrow(win.width < 768));
  }, []);
  // Periodic provider reachability probe so the status dot stays honest
  const settings = useAppStore((s) => s.settings);
  const providerOk = useAppStore((s) => s.gatewayReachable);
  const setProviderOk = useAppStore((s) => s.setGatewayReachable);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const ok = await getLLMClient().isReachable();
        if (!cancelled) setProviderOk(ok);
      } catch {
        if (!cancelled) setProviderOk(false);
      }
      if (!cancelled) timer = setTimeout(tick, 30_000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [settings.llmProvider, settings.llmEndpoint, settings.llmApiKey, setProviderOk]);

  useEffect(() => {
    if (narrow) setDrawerOpen(false);
  }, [activeId, narrow]);

  const active = activeId ? conversations[activeId] : null;

  return (
    <View style={[styles.root, { paddingTop: isNative ? insets.top : 0 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={neutral.bg} />

      {/* ── Ambient sakura petal rain — pointerEvents none, never blocks input ── */}
      <SakuraRain count={isNarrow ? 8 : 14} opacity={0.22} />

      {/* ── App bar ─────────────────────────────────────────────────── */}
      <View style={[styles.appBar, { backgroundColor: neutral.bg, borderBottomColor: neutral.border }]}>
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
            placeholderTextColor={neutral.inkMuted}
          />
        ) : (
          <Pressable
            style={styles.titlePress}
            onPress={() => { if (active) { haptic('light'); setDraftTitle(active.title); setEditingTitle(true); } }}
          >
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.appBarTitle}>🌸 {active?.title ?? 'Hermes'}</Text>
              <Text style={[styles.appBarSparkle, { color: accent.accent.fg }]}>✦</Text>
            </View>
            <Text numberOfLines={1} style={styles.appBarSubtitle}>
              📱 {`${Object.keys(conversations).length} sessions ♡`}
            </Text>
          </Pressable>
        )}

        <View style={styles.appBarRight}>
          {narrow ? (
            <Pressable hitSlop={12} onPress={() => setPromptsOpen(true)} style={styles.iconBtn}>
              <Text style={[styles.iconBtnText, { color: accent.accent.fg }]}>✨</Text>
            </Pressable>
          ) : null}
          {narrow ? (
            <Pressable hitSlop={12} onPress={() => { haptic('light'); setSettingsOpen(true); }} style={styles.iconBtn}>
              <View style={styles.iconBtnWithDot}>
                <Text style={styles.iconBtnText}>⚙</Text>
                <View style={[styles.statusDot, statusDotColor(settings.llmProvider, providerOk)]} />
              </View>
            </Pressable>
          ) : null}
          <Pressable hitSlop={12} onPress={() => { haptic('medium'); createConv(); }} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: accent.accent.fg }]}>＋ ♡</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {narrow ? (
        <View style={styles.mobileBody}>
          <ChatView onOpenDrawer={() => setDrawerOpen(true)} />
        </View>
      ) : (
        <DesktopLayout
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}

      {/* ── Mobile drawer ───────────────────────────────────────────── */}
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

      {/* ── Mobile prompt sheet ─────────────────────────────────────── */}
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

      {/* ── Status bar — shows the live provider / runs-mode / reachability ── */}
      <View style={[styles.statusBar, { borderTopColor: neutral.border, backgroundColor: neutral.surface }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusBarDot, { backgroundColor: statusDotColorFor(settings.llmProvider, providerOk) }]} />
          <Text style={styles.statusText}>
            {settings.llmProvider === 'mock' ? '🧪 Mock' : (settings.llmProvider as string)}
          </Text>
          {providerOk === false && settings.llmProvider !== 'mock' ? (
            <Text style={[styles.statusText, { color: neutral.err, marginLeft: 4 }]}>· offline</Text>
          ) : providerOk === true && settings.llmProvider !== 'mock' ? (
            <Text style={[styles.statusText, { color: neutral.ok, marginLeft: 4 }]}>· online</Text>
          ) : null}
          {(settings as any).useRunsMode ? (
            <Text style={[styles.statusText, { marginLeft: 8, color: accent.accent.fg }]}>⚡ runs-mode</Text>
          ) : null}
        </View>
        <Text style={styles.statusText}>
          📱 {Object.keys(conversations).length} sessions ♡
        </Text>
      </View>

      {/* ── Settings ────────────────────────────────────────────────── */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
};

// ─── Desktop three-pane ──────────────────────────────────────────────────────

const DesktopLayout: React.FC<{ onOpenSettings: () => void; onOpenDrawer: () => void }> = ({ onOpenSettings, onOpenDrawer }) => {
  const accent = useTheme();
  const conversations = useAppStore((s) => s.conversations);
  const order = useAppStore((s) => s.conversationOrder);
  const activeId = useAppStore((s) => s.activeConversationId);
  const setActive = useAppStore((s) => s.setActiveConversation);
  const createConv = useAppStore((s) => s.createConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);

  return (
    <View style={styles.desktopBody}>
      {/* Left rail */}
      <View style={styles.rail}>
        <View style={styles.railHeader}>
          <Text style={styles.railTitle}>Sessions</Text>
          <Pressable hitSlop={8} onPress={() => createConv()}>
            <Text style={[styles.railAction, { color: accent.accent.fg }]}>+ New</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.railList} contentContainerStyle={{ padding: space.xs }}>
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
                  isActive ? [styles.railItemActive, { backgroundColor: accent.accent.soft }] : null,
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
        <Text style={styles.railHint}>Long-press to delete</Text>
      </View>

      <View style={styles.desktopCenter}>
        <ChatView onOpenDrawer={onOpenDrawer} />
      </View>

      <View style={styles.desktopRight}>
        <PromptNavigator
          onInsertPrompt={(body) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('hermes:insert-prompt', { detail: body }));
            }
          }}
        />
        <Pressable onPress={onOpenSettings} style={styles.desktopSettingsBtn}>
          <Text style={[styles.desktopSettingsText, { color: accent.accent.fg }]}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
};

function statusDotColor(provider: 'hermes-gateway' | 'mock' | 'openai-compatible' | 'ollama', ok: boolean | null) {
  if (provider === 'mock') return { backgroundColor: neutral.inkMuted };
  if (ok === null) return { backgroundColor: neutral.inkMuted };
  return ok ? { backgroundColor: neutral.ok } : { backgroundColor: neutral.err };
}

function statusDotColorFor(provider: string, ok: boolean | null) {
  if (provider === 'mock') return neutral.inkMuted;
  if (ok === null) return neutral.inkMuted;
  return ok ? neutral.ok : neutral.err;
}

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
          <Pressable hitSlop={8} onPress={onNew}>
            <Text style={[styles.drawerAction, { color: accent.accent.fg }]}>+ New</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.sm }}>
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
                  isActive ? [styles.drawerItemActive, { backgroundColor: accent.accent.soft }] : null,
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
        <Text style={styles.drawerHint}>Tap switch · long-press delete</Text>
      </Animated.View>
    </Modal>
  );
};

// ─── Mobile prompt sheet ─────────────────────────────────────────────────────

const PromptSheet: React.FC<{ open: boolean; onClose: () => void; onInsertPrompt: (body: string) => void }> = ({ open, onClose, onInsertPrompt }) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: open ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [open, slideAnim]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] });
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
        <PromptNavigator onInsertPrompt={(body) => { onInsertPrompt(body); onClose(); }} embedded />
      </Animated.View>
    </Modal>
  );
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neutral.bg },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appBarTitle: { ...type.title, color: neutral.ink, fontSize: 16 },
  appBarSparkle: { fontSize: 12, marginLeft: 6, opacity: 0.8 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  appBarSubtitle: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  iconBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: neutral.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  iconBtnText: { fontSize: 18, color: neutral.ink, lineHeight: 22 },
  iconBtnWithDot: { position: 'relative', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: neutral.bg },
  titlePress: { flex: 1, minWidth: 0 },
  titleInput: {
    flex: 1, ...type.body, color: neutral.ink, backgroundColor: neutral.surface,
    paddingHorizontal: space.xs, paddingVertical: 4, minHeight: 32, borderRadius: radius.sm,
    borderWidth: 1, borderColor: neutral.border,
  },

  mobileBody: { flex: 1 },

  desktopBody: { flex: 1, flexDirection: 'row' },
  desktopCenter: { flex: 1 },
  desktopRight: { width: 300, marginRight: space.sm, marginVertical: space.sm, backgroundColor: neutral.surface, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border, padding: space.sm },
  desktopSettingsBtn: { marginTop: space.sm, paddingVertical: space.xs, alignItems: 'center' },
  desktopSettingsText: { ...type.uiBold, fontSize: 13 },

  rail: { width: 240, marginLeft: space.sm, marginVertical: space.sm, backgroundColor: neutral.surface, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border },
  railHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.sm, borderBottomWidth: 1, borderBottomColor: neutral.border },
  railTitle: { ...type.uiBold, color: neutral.ink, fontSize: 13 },
  railAction: { ...type.caption, fontWeight: '600' },
  railList: { flex: 1 },
  railItem: { paddingHorizontal: space.sm, paddingVertical: space.xs + 2, marginVertical: 2, borderRadius: radius.sm },
  railItemActive: {},
  railItemPressed: { backgroundColor: neutral.surfaceMuted },
  railItemText: { ...type.body, color: neutral.ink, fontSize: 13 },
  railItemTextActive: { fontWeight: '600' },
  railItemMeta: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  railHint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', padding: space.xs, fontStyle: 'italic', borderTopWidth: 1, borderTopColor: neutral.border },

  drawerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  drawerPanel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 320, maxWidth: '85%',
    backgroundColor: neutral.surface, borderRightWidth: 1, borderRightColor: neutral.border,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingBottom: space.sm, marginBottom: space.xs,
  },
  drawerTitle: { ...type.title, color: neutral.ink, fontSize: 16 },
  drawerAction: { ...type.caption, fontWeight: '600' },
  drawerItem: { paddingHorizontal: space.md, paddingVertical: space.sm, marginVertical: 2, borderRadius: radius.sm },
  drawerItemActive: {},
  drawerItemPressed: { backgroundColor: neutral.surfaceMuted },
  drawerItemText: { ...type.body, color: neutral.ink, fontSize: 14 },
  drawerItemTextActive: { fontWeight: '600' },
  drawerItemMeta: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  drawerHint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', padding: space.sm, fontStyle: 'italic' },

  sheetPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 540, maxHeight: '80%',
    backgroundColor: neutral.surface, borderTopWidth: 1, borderTopColor: neutral.border, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  sheetHandleWrap: { alignItems: 'center', paddingBottom: space.xs },
  sheetHandle: { width: 40, height: 4, backgroundColor: neutral.border, borderRadius: 2 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  statusBarDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  statusText: { ...type.caption, color: neutral.inkSoft, fontSize: 11 },
});
