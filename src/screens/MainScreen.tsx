import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  Modal, Animated, PanResponder, Platform, StatusBar, Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, useTheme } from '../theme';
import type { Reachability } from '../services/llm/types';
import { DOWN } from '../services/llm/types';
import { ChatView } from '../components/chat/ChatView';
import { PromptNavigator } from '../components/prompt-nav/PromptNavigator';
import { SettingsPanel } from '../components/SettingsPanel';
import { SakuraRain } from '../components/SakuraRain';
import { useAppStore } from '../store/app';
import { getLLMClient } from '../store/persistence';
import { useHermesSnapshot } from '../store/useHermesSnapshot';
import { HermesSessionsClient } from '../services/llm/sessions-client';
import { WelcomeOverlay, shouldShowWelcome, markWelcomeSeen } from '../components/WelcomeOverlay';
import { isNarrow, isNative, watchScreen } from '../utils/platform';
import { haptic } from '../utils/haptic';

export const MainScreen: React.FC = () => {
  // Keep a live snapshot of the Hermes backend in the store
  useHermesSnapshot();

  // First-time welcome: when the gateway becomes reachable for the
  // first time, show the welcome overlay. Persisted so returning
  // users don't see it again.
  const hermesSnapshot = useAppStore((s) => s.hermesSnapshot);
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!hermesSnapshot) return;
    let cancelled = false;
    (async () => {
      const should = await shouldShowWelcome(hermesSnapshot);
      if (should && !cancelled) setShowWelcome(true);
    })();
    return () => { cancelled = true; };
  }, [hermesSnapshot?.updatedAt]);

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

  // iOS-style "swipe from the left edge" to open the drawer.
  // PanResponder is captured in MainScreen (not a hook) so it can
  // close over setDrawerOpen without a re-bind every render.
  const edgeSwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const x = e.nativeEvent.locationX;
        return x <= 24; // only the left edge
      },
      onMoveShouldSetPanResponder: (e, g) => {
        return Math.abs(g.dx) > 8 && g.dx > 0 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
      },
      onPanResponderRelease: (e, g) => {
        if (g.dx > 60 || g.vx > 0.4) {
          haptic('light');
          setDrawerOpen(true);
        }
      },
    }),
  ).current;

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
        if (!cancelled) setProviderOk(DOWN);
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
            <Text style={[styles.iconBtnText, styles.iconBtnKawaii]}>☰</Text>
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
            onLongPress={() => {
              if (active) {
                haptic('medium');
                try { Clipboard.setString(active.id); } catch { /* noop */ }
              }
            }}
          >
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.appBarTitle}>🌸 {active?.title ?? 'Hermes'}</Text>
              <Text style={[styles.appBarSparkle, { color: accent.accent.fg }]}>✦</Text>
            </View>
            <Text numberOfLines={1} style={styles.appBarSubtitle}>
              📱 {`${Object.keys(conversations).length} sessions ♡`}
              {active?.id ? ` · 🆔 ${active.id.slice(-8)}` : ''}
            </Text>
          </Pressable>
        )}

        <View style={styles.appBarRight}>
          {narrow ? (
            <Pressable
              hitSlop={12}
              onPress={async () => {
                if (!activeId) { haptic('warning'); return; }
                haptic('light');
                const cfg = {
                  provider: 'hermes-gateway' as const,
                  endpoint: settings.llmEndpoint || 'http://127.0.0.1:8642/v1/chat/completions',
                  apiKey: settings.llmApiKey || undefined,
                  defaultModel: settings.llmModel || 'default',
                };
                const { HermesSessionsClient } = await import('../services/llm/sessions-client');
                const client = new HermesSessionsClient(cfg);
                const msgs = await client.messages(activeId);
                if (!msgs) { haptic('error'); return; }
                // Merge remote messages into the active conversation
                const existing = useAppStore.getState().conversations[activeId];
                const byId = new Map<string, any>();
                for (const m of existing?.messages ?? []) byId.set(m.id, m);
                let added = 0;
                for (const m of msgs as any[]) {
                  if (!byId.has(m.id)) {
                    byId.set(m.id, {
                      id: m.id ?? `pull-${Math.random().toString(36).slice(2, 8)}`,
                      role: m.role ?? 'user',
                      content: typeof m.content === 'string' ? m.content : (m.text ?? ''),
                      status: 'done' as const,
                      createdAt: m.created_at ?? m.createdAt ?? Date.now(),
                    });
                    added += 1;
                  }
                }
                if (added > 0) {
                  useAppStore.setState((s) => ({
                    conversations: {
                      ...s.conversations,
                      [activeId]: {
                        ...(s.conversations[activeId] ?? existing!),
                        id: activeId,
                        messages: Array.from(byId.values()).sort((a: any, b: any) => a.createdAt - b.createdAt),
                        updatedAt: Date.now(),
                      },
                    },
                  }));
                  haptic('success');
                } else {
                  haptic('warning');
                }
              }}
              style={styles.iconBtn}
            >
              <Text style={[styles.iconBtnText, { color: accent.accent.fg }]}>🔄</Text>
            </Pressable>
          ) : null}
          {narrow ? (
            <Pressable hitSlop={12} onPress={() => setPromptsOpen(true)} style={styles.iconBtn}>
              <Text style={[styles.iconBtnText, styles.iconBtnKawaii]}>✨</Text>
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
            <Text style={[styles.iconBtnText, styles.iconBtnAccent]}>＋</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {narrow ? (
        <View style={styles.mobileBody}>
          <ChatView onOpenDrawer={() => setDrawerOpen(true)} />
          {/* Edge-swipe zone: 24-px invisible strip along the left edge
              that captures horizontal drags and opens the drawer.
              iOS-style "swipe from the left edge" affordance. */}
          <View
            {...edgeSwipePan.panHandlers}
            pointerEvents="auto"
            style={styles.edgeSwipeZone}
          />
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
          onPickRemote={async (id) => {
            haptic('light');
            try {
              const cfg = {
                provider: 'hermes-gateway' as const,
                endpoint: settings.llmEndpoint || 'http://127.0.0.1:8642/v1/chat/completions',
                apiKey: settings.llmApiKey || undefined,
                defaultModel: settings.llmModel || 'default',
              };
              const client = new HermesSessionsClient(cfg);
              const [session, messages] = await Promise.all([
                client.get(id),
                client.messages(id),
              ]);
              if (!session) {
                haptic('error');
                setDrawerOpen(false);
                return;
              }
              useAppStore.getState().importRemoteSession(
                id,
                session.title || id,
                (messages as any[]) ?? [],
              );
              haptic('success');
            } catch (e) {
              haptic('error');
            } finally {
              setDrawerOpen(false);
            }
          }}
          remoteSessions={hermesSnapshot?.sessions}
          remoteJobs={hermesSnapshot?.jobs}
          remoteSkills={hermesSnapshot?.skills}
          remoteGatewayReachable={!!hermesSnapshot}
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
            {settings.llmProvider === 'hermes-gateway' ? '🌐 Hermes' : (settings.llmProvider as string)}
          </Text>
          {providerOk === null ? null : providerOk.ok ? (
            <Text style={[styles.statusText, { color: neutral.ok, marginLeft: 4 }]}>· online</Text>
          ) : (
            <Text style={[styles.statusText, { color: providerOk.status === 'no-auth' ? neutral.warn : neutral.err, marginLeft: 4 }]}>
              · {providerOk.status === 'no-auth' ? 'auth needed' : providerOk.status === 'timeout' ? 'slow' : 'offline'}
            </Text>
          )}
          {(settings as any).useRunsMode ? (
            <Text style={[styles.statusText, { marginLeft: 8, color: accent.accent.fg }]}>⚡ runs-mode</Text>
          ) : null}
        </View>
        <View style={styles.statusRight}>
          {hermesSnapshot ? (
            <View style={styles.snapChips}>
              <Text style={styles.snapChip} numberOfLines={1}>💬 {hermesSnapshot.sessions.length}</Text>
              <Text style={styles.snapChip} numberOfLines={1}>✨ {hermesSnapshot.skills.length}</Text>
              <Text style={styles.snapChip} numberOfLines={1}>🛠 {hermesSnapshot.toolsets.length}</Text>
              <Text style={styles.snapChip} numberOfLines={1}>📋 {hermesSnapshot.jobs.length}</Text>
            </View>
          ) : null}
          <Text style={styles.statusText}>
            📱 {Object.keys(conversations).length} ♡
          </Text>
        </View>
      </View>

      {/* ── Settings ────────────────────────────────────────────────── */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── Welcome overlay — wow-moment on first connect ─────────── */}
      <WelcomeOverlay
        visible={showWelcome}
        onDismiss={() => { setShowWelcome(false); markWelcomeSeen(); }}
      />
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

function statusDotColor(provider: 'hermes-gateway' | 'mock' | 'openai-compatible' | 'ollama', r: Reachability | null) {
  if (provider === 'mock') return { backgroundColor: neutral.inkMuted };
  if (r === null) return { backgroundColor: neutral.inkMuted };
  if (r.ok) return { backgroundColor: neutral.ok };
  if (r.status === 'no-auth') return { backgroundColor: neutral.warn };
  return { backgroundColor: neutral.err };
}

function statusDotColorFor(provider: string, r: Reachability | null) {
  if (provider === 'mock') return neutral.inkMuted;
  if (r === null) return neutral.inkMuted;
  if (r.ok) return neutral.ok;
  if (r.status === 'no-auth') return neutral.warn;
  return neutral.err;
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
  onPickRemote?: (id: string) => void;
  remoteSessions?: { id: string; title?: string; messageCount?: number; updatedAt?: number }[];
  remoteJobs?: { id: string }[];
  remoteSkills?: { id: string }[];
  remoteGatewayReachable: boolean;
  insets: { top: number; bottom: number; left: number; right: number };
}

const SessionDrawer: React.FC<DrawerProps> = ({
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

        {/* Hermes dashboard strip — single-line summary of what the
            gateway currently advertises. Sits at the very top of the
            drawer so a phone user opening it gets instant context
            for what's running on their computer. */}
        {remoteSessions ? (
          <View style={styles.dashStrip}>
            <Text style={styles.dashStripText} numberOfLines={1}>
              <Text style={styles.dashEmoji}>📡</Text>{' '}
              <Text style={styles.dashCount}>{remoteSessions.length}</Text> sessions
              {remoteJobs ? <> · <Text style={styles.dashEmoji}>📋</Text>{' '} <Text style={styles.dashCount}>{remoteJobs.length}</Text> jobs</> : null}
              {remoteSkills ? <> · <Text style={styles.dashEmoji}>✨</Text>{' '} <Text style={styles.dashCount}>{remoteSkills.length}</Text> skills</> : null}
            </Text>
          </View>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.sm }}>
          {remoteSessions && remoteSessions.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.drawerSectionHeader, { color: accent.accent.fg }]}>
                📡 Hermes (remote)
              </Text>
              {remoteSessions.map((s) => (
                <Pressable
                  key={`remote:${s.id}`}
                  onPress={() => onPickRemote?.(s.id)}
                  style={({ pressed }) => [
                    styles.drawerItem,
                    styles.drawerItemRemote,
                    pressed ? styles.drawerItemPressed : null,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.drawerItemText}>
                    🖥 {s.title || s.id}
                  </Text>
                  <Text numberOfLines={1} style={styles.drawerItemMeta}>
                    {s.messageCount != null ? `${s.messageCount} msg` : '—'} · {s.updatedAt ? timeAgo(s.updatedAt) : '—'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.drawerSectionHeader}>
            📱 This device
          </Text>
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
  appBarTitle: { ...type.title, color: neutral.ink, fontSize: 17 },
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
  iconBtnText: { fontSize: 20, color: neutral.ink, lineHeight: 24 },
  iconBtnAccent: { color: '#007AFF' },   // primary CTA blue
  iconBtnKawaii: { color: '#FF8FAB' },  // kawaii pink
  iconBtnDot: { color: neutral.ink },
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
  railItemText: { ...type.bodyMd, color: neutral.ink, fontSize: 14 },
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
  drawerAction: { ...type.caption, fontWeight: '600' },
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

  sheetPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 540, maxHeight: '80%',
    backgroundColor: neutral.surface, borderTopWidth: 1, borderTopColor: neutral.border, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  sheetHandleWrap: { alignItems: 'center', paddingBottom: space.xs },
  sheetHandle: { width: 40, height: 4, backgroundColor: neutral.border, borderRadius: 2 },
  edgeSwipeZone: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 24,
    backgroundColor: 'transparent',
  },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  snapChips: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  snapChip: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10, fontFamily: 'Courier' },
  statusBarDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  statusText: { ...type.captionSm, color: neutral.inkSoft, fontSize: 11 },
});
