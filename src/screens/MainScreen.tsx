import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  PanResponder, StatusBar, Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, useTheme } from '../theme';
import type { Reachability } from '../services/llm/types';
import { DOWN } from '../services/llm/types';
import { ChatView } from '../components/chat/ChatView';
import { SettingsPanel } from '../components/SettingsPanel';
import { SakuraRain } from '../components/SakuraRain';
import { DesktopLayout } from '../components/layout/DesktopLayout';
import { PromptSheet } from '../components/layout/PromptSheet';
import { SessionDrawer } from '../components/layout/SessionDrawer';
import { WelcomeOverlay, shouldShowWelcome, markWelcomeSeen } from '../components/WelcomeOverlay';
import { NARROW_BREAKPOINT, REACHABILITY_POLL_MS } from '../config/app-constants';
import { buildLLMConfig, createSessionsClient } from '../services/llm/factory';
import { useAppStore } from '../store/app';
import { getLLMClient } from '../store/persistence';
import { useHermesSnapshot } from '../store/useHermesSnapshot';
import { isNarrow, isNative, watchScreen } from '../utils/platform';
import { haptic } from '../utils/haptic';

export const MainScreen: React.FC = () => {
  useHermesSnapshot();

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
  const togglePinConv = useAppStore((s) => s.togglePinConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);
  const mergeRemoteMessages = useAppStore((s) => s.mergeRemoteMessages);
  const importRemoteSession = useAppStore((s) => s.importRemoteSession);
  const settings = useAppStore((s) => s.settings);
  const providerOk = useAppStore((s) => s.gatewayReachable);
  const setProviderOk = useAppStore((s) => s.setGatewayReachable);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrow);

  const edgeSwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event) => event.nativeEvent.locationX <= 24,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 8 && gesture.dx > 0 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > 60 || gesture.vx > 0.4) {
          haptic('light');
          setDrawerOpen(true);
        }
      },
    }),
  ).current;

  useEffect(() => {
    return watchScreen((win) => setNarrow(win.width < NARROW_BREAKPOINT));
  }, []);

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
      if (!cancelled) timer = setTimeout(tick, REACHABILITY_POLL_MS);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [settings.llmProvider, settings.llmEndpoint, settings.llmApiKey, setProviderOk]);

  useEffect(() => {
    if (narrow) setDrawerOpen(false);
  }, [activeId, narrow]);

  const active = activeId ? conversations[activeId] : null;

  const syncActiveFromHermes = async () => {
    if (!activeId) {
      haptic('warning');
      return;
    }
    haptic('light');
    const messages = await createSessionsClient(buildLLMConfig(settings)).messages(activeId);
    if (!messages) {
      haptic('error');
      return;
    }
    const added = mergeRemoteMessages(activeId, messages);
    haptic(added > 0 ? 'success' : 'warning');
  };

  const importRemote = async (id: string) => {
    haptic('light');
    try {
      const client = createSessionsClient(buildLLMConfig(settings));
      const [session, messages] = await Promise.all([
        client.get(id),
        client.messages(id),
      ]);
      if (!session) {
        haptic('error');
        setDrawerOpen(false);
        return;
      }
      importRemoteSession(id, session.title || id, messages ?? []);
      haptic('success');
    } catch {
      haptic('error');
    } finally {
      setDrawerOpen(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: isNative ? insets.top : 0 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={neutral.bg} />
      <SakuraRain count={isNarrow ? 8 : 14} opacity={0.22} />

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
            <Pressable hitSlop={12} onPress={syncActiveFromHermes} style={styles.iconBtn}>
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
                <View style={[styles.statusDot, statusDotColor(providerOk)]} />
              </View>
            </Pressable>
          ) : null}
          <Pressable hitSlop={12} onPress={() => { haptic('medium'); createConv(); }} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, styles.iconBtnAccent]}>＋</Text>
          </Pressable>
        </View>
      </View>

      {narrow ? (
        <View style={styles.mobileBody}>
          <ChatView onOpenDrawer={() => setDrawerOpen(true)} />
          <View {...edgeSwipePan.panHandlers} pointerEvents="auto" style={styles.edgeSwipeZone} />
        </View>
      ) : (
        <DesktopLayout
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}

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
          onPin={(id) => togglePinConv(id)}
          onRename={(id, title) => renameConv(id, title)}
          onPickRemote={importRemote}
          remoteSessions={hermesSnapshot?.sessions}
          remoteJobs={hermesSnapshot?.jobs}
          remoteSkills={hermesSnapshot?.skills}
          remoteToolsets={hermesSnapshot?.toolsets}
          remoteGatewayReachable={!!hermesSnapshot}
          insets={insets}
        />
      ) : null}

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

      <View style={[styles.statusBar, { borderTopColor: neutral.border, backgroundColor: neutral.surface }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusBarDot, { backgroundColor: statusDotColorFor(providerOk) }]} />
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
          {settings.useRunsMode ? (
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
          <Text style={styles.statusText}>📱 {Object.keys(conversations).length} ♡</Text>
        </View>
      </View>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WelcomeOverlay
        visible={showWelcome}
        onDismiss={() => { setShowWelcome(false); markWelcomeSeen(); }}
      />
    </View>
  );
};

function statusDotColor(r: Reachability | null) {
  if (r === null) return { backgroundColor: neutral.inkMuted };
  if (r.ok) return { backgroundColor: neutral.ok };
  if (r.status === 'no-auth') return { backgroundColor: neutral.warn };
  return { backgroundColor: neutral.err };
}

function statusDotColorFor(r: Reachability | null) {
  if (r === null) return neutral.inkMuted;
  if (r.ok) return neutral.ok;
  if (r.status === 'no-auth') return neutral.warn;
  return neutral.err;
}

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
  iconBtnAccent: { color: '#007AFF' },
  iconBtnKawaii: { color: '#FF8FAB' },
  iconBtnWithDot: { position: 'relative', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: neutral.bg },
  titlePress: { flex: 1, minWidth: 0 },
  titleInput: {
    flex: 1, ...type.body, color: neutral.ink, backgroundColor: neutral.surface,
    paddingHorizontal: space.xs, paddingVertical: 4, minHeight: 32, borderRadius: radius.sm,
    borderWidth: 1, borderColor: neutral.border,
  },

  mobileBody: { flex: 1 },
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
