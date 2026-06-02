import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Switch,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, type, space, bevel } from '../theme';
import { Button } from './win95';
import { useAppStore } from '../store/app';
import { syncLLMFromSettings, getLLMClient } from '../store/persistence';
import { defaultEndpoint } from '../services/llm/config';
import { haptic } from '../utils/haptic';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const insets = useSafeAreaInsets();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Local drafts so user can type freely without store churn
  const [provider, setProvider] = useState(settings.llmProvider);
  const [endpoint, setEndpoint] = useState(settings.llmEndpoint || defaultEndpoint());
  const [apiKey, setApiKey] = useState(settings.llmApiKey);
  const [model, setModel] = useState(settings.llmModel);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [temperature, setTemperature] = useState(String(settings.temperature ?? ''));
  const [streamChunkMs, setStreamChunkMs] = useState(String(settings.streamChunkMs));
  const [haptics, setHaptics] = useState(settings.enableHaptics);

  // Probe state
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<null | { ok: boolean; msg: string }>(null);

  // Re-sync drafts whenever panel opens (in case settings changed elsewhere)
  useEffect(() => {
    if (!open) return;
    setProvider(settings.llmProvider);
    setEndpoint(settings.llmEndpoint || defaultEndpoint());
    setApiKey(settings.llmApiKey);
    setModel(settings.llmModel);
    setSystemPrompt(settings.systemPrompt);
    setTemperature(String(settings.temperature ?? ''));
    setStreamChunkMs(String(settings.streamChunkMs));
    setHaptics(settings.enableHaptics);
    setProbeResult(null);
  }, [open, settings]);

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
    });
    syncLLMFromSettings();
    try {
      const ok = await getLLMClient().isReachable();
      setProbeResult({
        ok,
        msg: ok ? 'Gateway reachable ✓' : 'Not reachable. Check the URL, or the gateway is offline.',
      });
      haptic(ok ? 'success' : 'warning');
    } catch (e: any) {
      setProbeResult({ ok: false, msg: `Probe failed: ${e?.message ?? e}` });
      haptic('error');
    } finally {
      setProbing(false);
    }
  }, [provider, endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, updateSettings]);

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
    });
    syncLLMFromSettings();
    haptic('success');
    onClose();
  }, [provider, endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, updateSettings, onClose]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, paddingTop: 12 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>⚙ Settings</Text>
          <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* ── Provider ─────────────────────────────────────────── */}
          <Section title="LLM Provider">
            <Text style={styles.label}>Backend</Text>
            <View style={styles.segmented}>
              {(['mock', 'hermes-gateway'] as const).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => { haptic('light'); setProvider(opt); }}
                  style={[
                    styles.segmentedItem,
                    provider === opt ? styles.segmentedItemActive : null,
                  ]}
                >
                  <Text style={[styles.segmentedText, provider === opt ? styles.segmentedTextActive : null]}>
                    {opt === 'mock' ? '🧪 Mock' : '🌐 Hermes gateway'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              {provider === 'mock'
                ? 'Offline fake responses. Useful for design work & demos.'
                : 'OpenAI-compatible streaming against your local Hermes gateway.'}
            </Text>
          </Section>

          {provider === 'hermes-gateway' ? (
            <Section title="Endpoint">
              <Text style={styles.label}>Chat completions URL</Text>
              <TextField value={endpoint} onChangeText={setEndpoint} placeholder={defaultEndpoint()} />
              <Text style={styles.hint}>
                Android emulator defaults to 10.0.2.2:8080. Physical devices on LAN: use the host's IP (e.g. http://192.168.1.10:8080/v1/chat/completions).
              </Text>
            </Section>
          ) : null}

          {provider === 'hermes-gateway' ? (
            <Section title="Auth">
              <Text style={styles.label}>API key (optional)</Text>
              <TextField value={apiKey} onChangeText={setApiKey} placeholder="sk-…" secureTextEntry />
            </Section>
          ) : null}

          <Section title="Model">
            <Text style={styles.label}>Model id</Text>
            <TextField value={model} onChangeText={setModel} placeholder="default" />
            <Text style={styles.hint}>
              Most Hermes gateways route "default" to whatever you have running.
            </Text>
          </Section>

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
            <Text style={styles.label}>Mock stream chunk delay (ms, mock only)</Text>
            <TextField value={streamChunkMs} onChangeText={setStreamChunkMs} placeholder="25" keyboardType="number-pad" />
            <View style={styles.switchRow}>
              <Text style={styles.label}>Haptics</Text>
              <Switch
                value={haptics}
                onValueChange={setHaptics}
                trackColor={{ true: palette.inkBlue, false: palette.bevelDark }}
                thumbColor={palette.bevelHi}
              />
            </View>
          </Section>

          {provider === 'hermes-gateway' ? (
            <Section title="Test connection">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Button label="Probe" onPress={probe} disabled={probing} small />
                {probing ? <ActivityIndicator /> : null}
              </View>
              {probeResult ? (
                <Text style={[styles.probeText, { color: probeResult.ok ? palette.ok : palette.err }]}>
                  {probeResult.msg}
                </Text>
              ) : null}
            </Section>
          ) : null}
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
    <View style={[styles.sectionBody, bevel.inset, { backgroundColor: palette.surface }]}>
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
}> = ({ value, onChangeText, placeholder, multiline, secureTextEntry, keyboardType, style }) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={palette.inkMuted}
    multiline={multiline}
    secureTextEntry={secureTextEntry}
    keyboardType={keyboardType}
    autoCapitalize="none"
    autoCorrect={false}
    style={[styles.textField, style]}
  />
);

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '8%',
    backgroundColor: palette.canvas,
    borderTopWidth: 2, borderTopColor: palette.bevelDark,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  sheetTitle: { ...type.title, color: palette.ink, fontSize: 16 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surface, borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelLo, borderBottomColor: palette.bevelLo,
  },
  closeBtnText: { fontSize: 18, color: palette.ink, lineHeight: 20 },
  section: { marginBottom: 12 },
  sectionTitle: { ...type.uiBold, color: palette.ink, marginBottom: 4 },
  sectionBody: { padding: 8 },
  label: { ...type.ui, color: palette.ink, marginTop: 4, marginBottom: 2 },
  textField: {
    ...type.body,
    color: palette.ink,
    backgroundColor: palette.paper,
    paddingHorizontal: 6,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelLo, borderLeftColor: palette.bevelLo,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelHi, borderBottomColor: palette.bevelHi,
    minHeight: 32,
  },
  hint: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic', marginTop: 4, fontSize: 10 },
  segmented: { flexDirection: 'row', gap: 0 },
  segmentedItem: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    backgroundColor: palette.surface,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelLo, borderBottomColor: palette.bevelLo,
  },
  segmentedItemActive: {
    backgroundColor: palette.inkBlue,
    borderTopColor: palette.bevelLo, borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi, borderBottomColor: palette.bevelHi,
  },
  segmentedText: { ...type.ui, color: palette.ink },
  segmentedTextActive: { color: palette.titlebarActiveText, fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  probeText: { ...type.ui, marginTop: 6, fontStyle: 'italic' },
  footer: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.bevelDark, backgroundColor: palette.surface,
  },
});
