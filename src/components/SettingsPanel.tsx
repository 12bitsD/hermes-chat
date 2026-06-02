import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Switch,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, palette, useTheme } from '../theme';
import { Button } from './win95';
import { useAppStore } from '../store/app';
import { syncLLMFromSettings, getLLMClient } from '../store/persistence';
import { defaultEndpoint, PRESETS, ProviderId } from '../services/llm/config';
import { accentList } from '../theme';
import { haptic } from '../utils/haptic';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const PRESET_ORDER: ProviderId[] = ['mock', 'hermes-gateway', 'openai-compatible', 'ollama'];

const PRESET_EMOJI: Record<ProviderId, string> = {
  mock: '🧪',
  'hermes-gateway': '🌐',
  'openai-compatible': '🔌',
  ollama: '🦙',
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const insets = useSafeAreaInsets();
  const accent = useTheme();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Local drafts so user can type freely without store churn
  const [provider, setProvider] = useState<ProviderId>(settings.llmProvider as ProviderId);
  const [endpoint, setEndpoint] = useState(settings.llmEndpoint || defaultEndpoint(provider));
  const [apiKey, setApiKey] = useState(settings.llmApiKey);
  const [model, setModel] = useState(settings.llmModel);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [temperature, setTemperature] = useState(String(settings.temperature ?? ''));
  const [streamChunkMs, setStreamChunkMs] = useState(String(settings.streamChunkMs));
  const [haptics, setHaptics] = useState(settings.enableHaptics);
  const [accentKey, setAccentKey] = useState(settings.accent);

  // Advanced
  const [maxTokens, setMaxTokens] = useState(String((settings as any).maxTokens ?? ''));
  const [sessionKey, setSessionKey] = useState((settings as any).sessionKey ?? '');
  const [useRunsMode, setUseRunsMode] = useState((settings as any).useRunsMode ?? false);

  // Probe + models list
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Re-sync drafts whenever panel opens (in case settings changed elsewhere)
  useEffect(() => {
    if (!open) return;
    setProvider(settings.llmProvider as ProviderId);
    setEndpoint(settings.llmEndpoint || defaultEndpoint(settings.llmProvider as ProviderId));
    setApiKey(settings.llmApiKey);
    setModel(settings.llmModel);
    setSystemPrompt(settings.systemPrompt);
    setTemperature(String(settings.temperature ?? ''));
    setStreamChunkMs(String(settings.streamChunkMs));
    setHaptics(settings.enableHaptics);
    setAccentKey(settings.accent);
    setMaxTokens(String((settings as any).maxTokens ?? ''));
    setSessionKey((settings as any).sessionKey ?? '');
    setUseRunsMode((settings as any).useRunsMode ?? false);
    setProbeResult(null);
    setModels([]);
  }, [open, settings]);

  // Apply a preset: change provider, reset endpoint + model + clear API fields
  const applyPreset = useCallback((p: ProviderId) => {
    haptic('light');
    setProvider(p);
    setEndpoint(PRESETS[p].baseUrl);
    setModel(PRESETS[p].defaultModel);
    setApiKey(PRESETS[p].defaultApiKey);
  }, []);

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeResult(null);
    // Apply the draft config first so probe uses the same client the chat will
    updateSettings({
      llmProvider: provider,
      llmEndpoint: endpoint,
      llmApiKey: apiKey,
      llmModel: model,
      systemPrompt,
      temperature: temperature.trim() === '' ? undefined : Number(temperature),
      streamChunkMs: Math.max(0, Number(streamChunkMs) || 0),
      enableHaptics: haptics,
      maxTokens: maxTokens.trim() === '' ? undefined : Number(maxTokens),
      sessionKey: sessionKey.trim() || undefined,
      useRunsMode,
    } as any);
    syncLLMFromSettings();
    try {
      const ok = await getLLMClient().isReachable();
      setProbeResult({
        ok,
        msg: ok
          ? `Gateway reachable ✓ (${PRESETS[provider].displayName})`
          : `Not reachable. Check the URL, or the ${PRESETS[provider].displayName} is offline.`,
      });
      haptic(ok ? 'success' : 'warning');
    } catch (e: any) {
      setProbeResult({ ok: false, msg: `Probe failed: ${e?.message ?? e}` });
      haptic('error');
    } finally {
      setProbing(false);
    }
  }, [provider, endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, maxTokens, sessionKey, updateSettings]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    setModels([]);
    try {
      // Save first so the client uses the right URL
      updateSettings({
        llmProvider: provider,
        llmEndpoint: endpoint,
        llmApiKey: apiKey,
        llmModel: model,
        systemPrompt,
        temperature: temperature.trim() === '' ? undefined : Number(temperature),
        streamChunkMs: Math.max(0, Number(streamChunkMs) || 0),
        enableHaptics: haptics,
        maxTokens: maxTokens.trim() === '' ? undefined : Number(maxTokens),
        sessionKey: sessionKey.trim() || undefined,
      } as any);
      syncLLMFromSettings();
      const c = getLLMClient() as any;
      if (typeof c.listModels === 'function') {
        const ms = await c.listModels();
        setModels(ms);
        haptic(ms.length ? 'success' : 'warning');
      } else {
        setProbeResult({ ok: false, msg: 'This provider does not expose a /v1/models endpoint.' });
        haptic('warning');
      }
    } catch (e: any) {
      setProbeResult({ ok: false, msg: `List models failed: ${e?.message ?? e}` });
      haptic('error');
    } finally {
      setLoadingModels(false);
    }
  }, [provider, endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, maxTokens, sessionKey, updateSettings]);

  const save = useCallback(() => {
    updateSettings({
      llmProvider: provider,
      llmEndpoint: endpoint,
      llmApiKey: apiKey,
      llmModel: model,
      systemPrompt,
      temperature: temperature.trim() === '' ? undefined : Number(temperature),
      streamChunkMs: Math.max(0, Number(streamChunkMs) || 0),
      enableHaptics: haptics,
      accent: accentKey,
      maxTokens: maxTokens.trim() === '' ? undefined : Number(maxTokens),
      sessionKey: sessionKey.trim() || undefined,
      useRunsMode,
    } as any);
    syncLLMFromSettings();
    haptic('success');
    onClose();
  }, [provider, endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, accentKey, maxTokens, sessionKey, useRunsMode, updateSettings, onClose]);

  const isCustom = provider === 'openai-compatible' || provider === 'hermes-gateway' || provider === 'ollama';
  const isHermes = provider === 'hermes-gateway';

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, paddingTop: 12 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>⚙ Settings ✦</Text>
          <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

          {/* ── Provider presets ──────────────────────────────────────── */}
          <Section title="LLM Provider">
            <View style={styles.presetGrid}>
              {PRESET_ORDER.map((p) => {
                const meta = PRESETS[p];
                const active = provider === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => applyPreset(p)}
                    style={[
                      styles.presetCard,
                      active ? [styles.presetCardActive, { borderColor: accent.accent.fg, backgroundColor: accent.accent.soft }] : null,
                    ]}
                  >
                    <Text style={styles.presetEmoji}>{PRESET_EMOJI[p]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.presetName, active ? styles.presetNameActive : null]}>{meta.displayName}</Text>
                      <Text style={styles.presetDesc} numberOfLines={2}>{meta.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {provider === 'mock'
                ? '🧪 Offline fake responses. Useful for design work & demos.'
                : `${PRESETS[provider].displayName} preset selected. Edit endpoint below if it differs from the default.`}
            </Text>
          </Section>

          {isCustom ? (
            <Section title="Endpoint">
              <Text style={styles.label}>Chat completions URL</Text>
              <TextField value={endpoint} onChangeText={setEndpoint} placeholder={PRESETS[provider].baseUrl} />
              <Text style={styles.hint}>
                Default for {PRESETS[provider].displayName}: <Text style={styles.code}>{PRESETS[provider].baseUrl}</Text>
                {'\n'}Android emulator: substitute 127.0.0.1 with 10.0.2.2.
              </Text>
            </Section>
          ) : null}

          {isCustom ? (
            <Section title="Auth">
              <Text style={styles.label}>API key {isHermes ? '(API_SERVER_KEY from gateway env)' : '(optional)'}</Text>
              <TextField value={apiKey} onChangeText={setApiKey} placeholder="sk-…" secureTextEntry />
            </Section>
          ) : null}

          {/* ── Model ──────────────────────────────────────────── */}
          <Section title="Model">
            <Text style={styles.label}>Model id</Text>
            <TextField value={model} onChangeText={setModel} placeholder={PRESETS[provider].defaultModel} />
            {isCustom ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Button label="Fetch models" onPress={fetchModels} disabled={loadingModels} small ghost />
                {loadingModels ? <ActivityIndicator /> : null}
              </View>
            ) : null}
            {models.length > 0 ? (
              <View style={styles.modelChips}>
                {models.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => { haptic('light'); setModel(m.id); }}
                    style={[
                      styles.modelChip,
                      model === m.id ? [styles.modelChipActive, { backgroundColor: accent.accent.fg, borderColor: accent.accent.fg }] : null,
                    ]}
                  >
                    <Text style={[styles.modelChipText, model === m.id ? styles.modelChipTextActive : null]} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.hint}>
              Most Hermes gateways route "default" to whatever model is currently running.
            </Text>
          </Section>

          {isHermes ? (
            <Section title="Hermes session (agent-friendly)">
              <Text style={styles.label}>Session key (X-Hermes-Session-Key)</Text>
              <TextField
                value={sessionKey}
                onChangeText={setSessionKey}
                placeholder="(optional) — scopes long-term memory"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                The Hermes gateway accepts a <Text style={styles.code}>X-Hermes-Session-Id</Text> header
                (we send your conversation id) and an optional <Text style={styles.code}>X-Hermes-Session-Key</Text>{' '}
                header that scopes long-term memory. Leave blank to use stateless chat.
              </Text>
              <View style={[styles.switchRow, { marginTop: 10 }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.label}>Agent runs mode (POST /v1/runs)</Text>
                  <Text style={styles.hint}>
                    Stream structured tool events, allow interrupting long runs, and surface approval prompts.
                    Slower than plain chat completions. Falls back automatically if the gateway doesn't support it.
                  </Text>
                </View>
                <Switch
                  value={useRunsMode}
                  onValueChange={setUseRunsMode}
                  trackColor={{ true: accent.accent.fg, false: neutral.border }}
                  thumbColor={neutral.surface}
                />
              </View>
            </Section>
          ) : null}

          {/* ── Behavior ──────────────────────────────────────── */}
          <Section title="Behavior">
            <Text style={styles.label}>System prompt</Text>
            <TextField
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              placeholder="You are Hermes, …"
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
            <Text style={styles.label}>Temperature (0–1, blank = server default)</Text>
            <TextField value={temperature} onChangeText={setTemperature} placeholder="0.7" keyboardType="numbers-and-punctuation" />
            <Text style={styles.label}>Max tokens (blank = server default)</Text>
            <TextField value={maxTokens} onChangeText={setMaxTokens} placeholder="2048" keyboardType="number-pad" />
            {provider === 'mock' ? (
              <>
                <Text style={styles.label}>Mock stream chunk delay (ms)</Text>
                <TextField value={streamChunkMs} onChangeText={setStreamChunkMs} placeholder="25" keyboardType="number-pad" />
              </>
            ) : null}
            <View style={styles.switchRow}>
              <Text style={styles.label}>Haptics</Text>
              <Switch
                value={haptics}
                onValueChange={setHaptics}
                trackColor={{ true: accent.accent.fg, false: neutral.border }}
                thumbColor={neutral.surface}
              />
            </View>
          </Section>

          {/* ── Test ──────────────────────────────────────────── */}
          {isCustom ? (
            <Section title="Test connection">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button label="Probe" onPress={probe} disabled={probing} small default />
                {probing ? <ActivityIndicator /> : null}
              </View>
              {probeResult ? (
                <Text style={[styles.probeText, { color: probeResult.ok ? neutral.ok : neutral.err }]}>
                  {probeResult.msg}
                </Text>
              ) : null}
            </Section>
          ) : null}

          {/* ── Appearance ──────────────────────────────────────── */}
          <Section title="Appearance">
            <Text style={styles.label}>Accent</Text>
            <View style={styles.accentGrid}>
              {accentList.map((a) => {
                const active = accentKey === a.name;
                return (
                  <Pressable
                    key={a.name}
                    onPress={() => { haptic('light'); setAccentKey(a.name); }}
                    style={[
                      styles.accentCard,
                      active ? styles.accentCardActive : null,
                    ]}
                  >
                    <View style={[styles.accentSwatch, { backgroundColor: a.accent.fg }]} />
                    <Text style={[styles.accentName, active ? styles.accentNameActive : null]}>
                      {a.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>Pick the accent that fits your mood ♡</Text>
          </Section>
        </ScrollView>

        <View style={[styles.footer, { paddingHorizontal: 12 }]}>
          <Button label="Cancel" onPress={onClose} small />
          <Button label="Save" default onPress={save} small />
        </View>
      </View>
    </Modal>
  );
};

// ─── helpers ────────────────────────────────────────────────────────────────

const Section: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>
      {children}
    </View>
  </View>
);

const TextField: React.FC<{
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: any;
  style?: any;
  autoCapitalize?: any;
  autoCorrect?: any;
}> = ({ value, onChangeText, placeholder, multiline, secureTextEntry, keyboardType, style, autoCapitalize, autoCorrect }) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={neutral.inkMuted}
    multiline={multiline}
    secureTextEntry={secureTextEntry}
    keyboardType={keyboardType}
    autoCapitalize={autoCapitalize}
    autoCorrect={autoCorrect}
    style={[styles.textField, style]}
  />
);

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '6%',
    backgroundColor: neutral.bg,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  sheetTitle: { ...type.title, color: neutral.ink, fontSize: 16 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: neutral.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  closeBtnText: { fontSize: 18, color: neutral.ink, lineHeight: 20 },
  section: { marginBottom: 12 },
  sectionTitle: { ...type.uiBold, color: neutral.ink, marginBottom: 4 },
  sectionBody: {
    padding: space.sm, backgroundColor: neutral.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  label: { ...type.caption, color: neutral.inkMuted, marginTop: space.xs, marginBottom: 2 },
  textField: {
    ...type.body, color: neutral.ink, backgroundColor: neutral.bg,
    paddingHorizontal: space.sm, paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    borderRadius: radius.sm, borderWidth: 1, borderColor: neutral.border, minHeight: 32,
  },
  hint: { ...type.caption, color: neutral.inkMuted, fontStyle: 'italic', marginTop: 4 },
  code: { fontFamily: 'Courier', color: neutral.ink, fontSize: 10 },
  presetGrid: { gap: space.xs },
  presetCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    padding: space.sm, backgroundColor: neutral.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  presetCardActive: {},
  presetEmoji: { fontSize: 22 },
  presetName: { ...type.uiBold, color: neutral.ink, marginBottom: 2 },
  presetNameActive: { color: neutral.ink },
  presetDesc: { ...type.caption, color: neutral.inkMuted },
  modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  modelChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: neutral.bg, borderRadius: radius.pill, borderWidth: 1, borderColor: neutral.border,
  },
  modelChipActive: {},
  modelChipText: { ...type.caption, color: neutral.ink },
  modelChipTextActive: { color: neutral.inkInverse, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  probeText: { ...type.caption, marginTop: 6, fontStyle: 'italic' },
  accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  accentCard: {
    width: '48%', padding: space.sm,
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border,
    backgroundColor: neutral.bg,
  },
  accentCardActive: { borderColor: neutral.ink, backgroundColor: neutral.surfaceMuted },
  accentSwatch: { width: 24, height: 24, borderRadius: radius.sm },
  accentName: { ...type.caption, color: neutral.ink, flex: 1 },
  accentNameActive: { fontWeight: '600' },
  footer: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm,
    paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: neutral.border, backgroundColor: neutral.surface,
  },
});
