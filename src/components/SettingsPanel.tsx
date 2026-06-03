/**
 * Settings panel — single source of truth for how Hermes Chat talks to
 * the user's Hermes agent.
 *
 * Layout (top to bottom):
 *   1. Connection block — endpoint, API key, "Probe" + "Fetch models".
 *   2. Agent block — system prompt, temperature, model id.
 *   3. Hermes capabilities — auto-fetched /v1/capabilities.
 *   4. Hermes skills — auto-fetched /v1/skills.
 *   5. Hermes toolsets — auto-fetched /v1/toolsets.
 *   6. Hermes sessions (remote) — auto-fetched /api/sessions.
 *   7. Hermes jobs (remote) — auto-fetched /api/jobs.
 *   8. Hermes headers — session-key + agent-runs toggle.
 *   9. App — accent picker, haptics, font size.
 *
 * The "model id" field is a free text input even when the gateway
 * has been probed — the list is just suggestions. The endpoint is a
 * free text input too because the user might be running the agent on
 * a tunnel or a different machine.
 */

import React from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, useTheme, accentList } from '../theme';
import { Button, TextField } from './win95';
import { useAppStore } from '../store/app';
import { HERMES_CHAT_ENDPOINT_PATH, HERMES_GATEWAY_PORT, SNAPSHOT_POLL_MS } from '../config/app-constants';
import { CAPABILITY_LABELS } from '../services/llm/capabilities';
import { useSettingsController } from '../features/settings/useSettingsController';
import { haptic } from '../utils/haptic';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const ENDPOINT_PLACEHOLDER = `http://127.0.0.1:${HERMES_GATEWAY_PORT}${HERMES_CHAT_ENDPOINT_PATH}`;
const SNAPSHOT_POLL_SECONDS = Math.floor(SNAPSHOT_POLL_MS / 1000);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const insets = useSafeAreaInsets();
  const accent = useTheme();
  const {
    endpoint, setEndpoint,
    apiKey, setApiKey,
    model, setModel,
    systemPrompt, setSystemPrompt,
    temperature, setTemperature,
    maxTokens, setMaxTokens,
    haptics, setHaptics,
    accentKey, setAccentKey,
    sessionKey, setSessionKey,
    useRunsMode, setUseRunsMode,
    probing, probeResult,
    models, loadingModels,
    caps, loadingCaps,
    skills, loadingSkills,
    toolsets, loadingToolsets,
    sessions, loadingSessions,
    jobs, loadingJobs,
    probe,
    fetchModels,
    fetchCapabilitiesNow,
    fetchSkillsNow,
    fetchToolsetsNow,
    fetchSessionsNow,
    fetchJobsNow,
    runJob,
    pauseJob,
    resumeJob,
    save,
  } = useSettingsController(open, onClose);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: neutral.surface, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>⚙ Settings</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Connect to your Hermes agent on the network
            </Text>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Connection ─────────────────────────────────────────── */}
            <Section title="Connection">
              <Text style={styles.label}>Endpoint</Text>
              <TextField value={endpoint} onChangeText={setEndpoint} placeholder={ENDPOINT_PLACEHOLDER} />

              <Text style={styles.label}>API key (required — paste from <Text style={{ fontFamily: 'Courier' }}>hermes config show</Text>)</Text>
              <TextField value={apiKey} onChangeText={setApiKey} placeholder="Hermes API_SERVER_KEY (required)" secureTextEntry />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <Button label="Probe" onPress={probe} disabled={probing} small default />
                <Button label="Fetch models" onPress={fetchModels} disabled={loadingModels} small ghost />
                {probing || loadingModels ? <ActivityIndicator /> : null}
                {probeResult ? (
                  <Text style={[styles.probeText, { color: probeResult.ok ? neutral.ok : neutral.err }]}>
                    {probeResult.msg}
                  </Text>
                ) : null}
              </View>
              {models.length > 0 ? (
                <View style={styles.modelStrip}>
                  {models.map((m) => (
                    <Pressable key={m.id} onPress={() => setModel(m.id)}>
                      <Text
                        style={[
                          styles.modelChip,
                          model === m.id ? { borderColor: accent.accent.fg, backgroundColor: accent.accent.soft, color: neutral.ink } : null,
                        ]}
                        numberOfLines={1}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Section>

            {/* ── Agent ────────────────────────────────────────────── */}
            <Section title="Agent">
              <Text style={styles.label}>Model id (or "default")</Text>
              <TextField value={model} onChangeText={setModel} placeholder="default" />

              <Text style={styles.label}>System prompt</Text>
              <TextField
                value={systemPrompt}
                onChangeText={setSystemPrompt}
                placeholder="You are Hermes, the agent. Be concise, kawaii, useful."
                multiline
                numberOfLines={4}
              />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temperature</Text>
                  <TextField value={temperature} onChangeText={setTemperature} placeholder="0.7" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Max tokens</Text>
                  <TextField value={maxTokens} onChangeText={setMaxTokens} placeholder="1024" keyboardType="numeric" />
                </View>
              </View>
            </Section>

            {/* ── Live snapshot ──────────────────────────────────────── */}
            <Section title="Live snapshot">
              <HermesSnapshotCard />
            </Section>

            {/* ── Hermes headers ──────────────────────────────────────── */}
            <Section title="Hermes headers">
              <Text style={styles.label}>Session key (X-Hermes-Session-Key)</Text>
              <TextField
                value={sessionKey}
                onChangeText={setSessionKey}
                placeholder="scope this device's memory"
                autoCapitalize="none"
              />
              <Text style={styles.hint}>
                Scopes Hermes long-term memory. Leave empty for an anonymous device.
              </Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Use /v1/runs for agent runs</Text>
                <Switch value={useRunsMode} onValueChange={setUseRunsMode} />
              </View>
              <Text style={styles.hint}>
                Surfaces tool events + approval requests on the phone. Off = simpler /v1/chat/completions stream.
              </Text>
            </Section>

            {/* ── Hermes capabilities (live discovery) ───────────────── */}
            <Section title="Hermes capabilities">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button label="Refresh" onPress={fetchCapabilitiesNow} disabled={loadingCaps} small ghost />
                {loadingCaps ? <ActivityIndicator /> : null}
                {caps ? <Text style={styles.capsModel} numberOfLines={1}>{caps.platform} · {caps.model}</Text> : null}
              </View>
              {caps ? (
                <View style={styles.capsGrid}>
                  {Object.entries(CAPABILITY_LABELS).map(([key, meta]) => {
                    const v = caps.features[key];
                    const on = v === true || v === 'on' || v === 'true';
                    if (v === undefined) return null;
                    return (
                      <View key={key} style={[styles.capsItem, on ? styles.capsItemOn : styles.capsItemOff]}>
                        <Text style={[styles.capsItemMark, on ? styles.capsItemMarkOn : styles.capsItemMarkOff]}>
                          {on ? '✓' : '·'}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.capsItemLabel}>{meta.label}</Text>
                          <Text style={styles.capsItemBlurb} numberOfLines={1}>{meta.blurb}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.hint}>
                  Gateway offline — couldn't read /v1/capabilities. Probe first to confirm reachability.
                </Text>
              )}
            </Section>

            {/* ── Hermes skills (live) ────────────────────────────────── */}
            <Section title="Hermes skills">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button label="Refresh" onPress={fetchSkillsNow} disabled={loadingSkills} small ghost />
                {loadingSkills ? <ActivityIndicator /> : null}
                {skills ? <Text style={styles.skillCount}>{skills.length} skill{skills.length === 1 ? '' : 's'}</Text> : null}
              </View>
              {skills === null ? (
                <Text style={styles.hint}>Gateway offline — couldn't list /v1/skills.</Text>
              ) : skills.length === 0 ? (
                <Text style={styles.hint}>No skills installed on the gateway yet.</Text>
              ) : (
                <View style={styles.listGrid}>
                  {skills.map((s) => (
                    <View key={s.id} style={styles.listItem}>
                      <Text style={styles.listItemName} numberOfLines={1}>✨ {s.name}</Text>
                      {s.description ? <Text style={styles.listItemDesc} numberOfLines={2}>{s.description}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* ── Hermes toolsets (live) ──────────────────────────────── */}
            <Section title="Hermes toolsets">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button label="Refresh" onPress={fetchToolsetsNow} disabled={loadingToolsets} small ghost />
                {loadingToolsets ? <ActivityIndicator /> : null}
                {toolsets ? <Text style={styles.skillCount}>{toolsets.length} toolset{toolsets.length === 1 ? '' : 's'}</Text> : null}
              </View>
              {toolsets === null ? (
                <Text style={styles.hint}>Gateway offline — couldn't list /v1/toolsets.</Text>
              ) : toolsets.length === 0 ? (
                <Text style={styles.hint}>No toolsets registered on the gateway.</Text>
              ) : (
                <View style={styles.listGrid}>
                  {toolsets.map((t) => (
                    <View key={t.id} style={styles.listItem}>
                      <Text style={styles.listItemName} numberOfLines={1}>🛠 {t.name}</Text>
                      {t.description ? <Text style={styles.listItemDesc} numberOfLines={2}>{t.description}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* ── Hermes sessions (remote) ────────────────────────────── */}
            <Section title="Hermes sessions (remote)">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button label="Refresh" onPress={fetchSessionsNow} disabled={loadingSessions} small ghost />
                {loadingSessions ? <ActivityIndicator /> : null}
                {sessions ? <Text style={styles.skillCount}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</Text> : null}
              </View>
              {sessions === null ? (
                <Text style={styles.hint}>Gateway offline — couldn't list /api/sessions.</Text>
              ) : sessions.length === 0 ? (
                <Text style={styles.hint}>No sessions on the gateway yet. Start one and it will appear here.</Text>
              ) : (
                <View style={styles.listGrid}>
                  {sessions.map((s) => (
                    <View key={s.id} style={styles.listItem}>
                      <Text style={styles.listItemId} numberOfLines={1}>{s.id}</Text>
                      <Text style={styles.listItemName} numberOfLines={1}>{s.title || '(untitled)'}</Text>
                      {s.message_count != null ? <Text style={styles.listItemDesc}>{s.message_count} msg</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* ── Hermes jobs (remote) ────────────────────────────────── */}
            <Section title="Hermes jobs (remote)">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button label="Refresh" onPress={fetchJobsNow} disabled={loadingJobs} small ghost />
                {loadingJobs ? <ActivityIndicator /> : null}
                {jobs ? <Text style={styles.skillCount}>{jobs.length} job{jobs.length === 1 ? '' : 's'}</Text> : null}
              </View>
              {jobs === null ? (
                <Text style={styles.hint}>Gateway offline — couldn't list /api/jobs.</Text>
              ) : jobs.length === 0 ? (
                <Text style={styles.hint}>No jobs queued on the gateway.</Text>
              ) : (
                <View style={styles.listGrid}>
                  {jobs.map((j) => {
                    const isRunning = j.state === 'running';
                    const isPaused = j.state === 'paused';
                    return (
                      <View key={j.id} style={styles.listItem}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.listItemName} numberOfLines={1}>{j.title || j.id}</Text>
                          <Text style={[styles.jobState, jobStateColor(j.state)]}>{j.state || 'queued'}</Text>
                        </View>
                        {j.schedule ? <Text style={styles.listItemDesc} numberOfLines={1}>{j.schedule}</Text> : null}
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                          {isRunning ? (
                            <Button
                              label="⏸ Pause"
                              onPress={() => pauseJob(j.id)}
                              small ghost
                            />
                          ) : (
                            <Button
                              label="▶ Run"
                              onPress={() => runJob(j.id)}
                              small ghost
                            />
                          )}
                          {isPaused ? (
                            <Button
                              label="↪ Resume"
                              onPress={() => resumeJob(j.id)}
                              small ghost
                            />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>

            {/* ── App ─────────────────────────────────────────────── */}
            <Section title="App">
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
                        active ? { borderColor: accent.accent.fg, borderWidth: 2 } : null,
                      ]}
                    >
                      <View style={[styles.accentSwatch, { backgroundColor: a.accent.fg }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.accentLabel}>{a.displayName}</Text>
                        <Text style={styles.accentHint} numberOfLines={1}>{a.name}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>Pick the accent that fits your mood ♡</Text>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Haptic feedback</Text>
                <Switch value={haptics} onValueChange={setHaptics} />
              </View>
            </Section>

          </ScrollView>

          <View style={[styles.footer, { paddingHorizontal: 12 }]}>
            <Button label="Cancel" onPress={onClose} small />
            <Button label="Save" default onPress={save} small />
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── helpers ────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

/**
 * HermesSnapshotCard — small live read-out of what the gateway is
 * currently advertising: counts of skills, toolsets, sessions, jobs
 * plus a "last synced Ns ago" timestamp. The data is already in the
 * store thanks to useHermesSnapshot (mounted at MainScreen), so this
 * is just a presentational component.
 */
const HermesSnapshotCard: React.FC = () => {
  const snap = useAppStore((s) => s.hermesSnapshot);
  const accent = useTheme();

  if (!snap) {
    return (
      <Text style={styles.hint}>
        Gateway offline — last sync never succeeded. The status bar at the
        bottom of the app shows the live dot; if it's red, start the
        Hermes gateway on port {HERMES_GATEWAY_PORT} and the snapshot will populate within
        {SNAPSHOT_POLL_SECONDS} s.
      </Text>
    );
  }

  const age = Math.max(0, Math.floor((Date.now() - snap.updatedAt) / 1000));
  const ageLabel = age < 5 ? 'just now' : age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        <Chip emoji="💬" count={snap.sessions.length} label="sessions" fg={accent.accent.fg} />
        <Chip emoji="✨" count={snap.skills.length} label="skills" fg={accent.accent.fg} />
        <Chip emoji="🛠" count={snap.toolsets.length} label="toolsets" fg={accent.accent.fg} />
        <Chip emoji="📋" count={snap.jobs.length} label="jobs" fg={accent.accent.fg} />
      </View>
      <Text style={styles.hint}>
        Last synced {ageLabel} · auto-refreshes every {SNAPSHOT_POLL_SECONDS} s.
      </Text>
    </View>
  );
};

const Chip: React.FC<{ emoji: string; count: number; label: string; fg: string }> = ({ emoji, count, label, fg }) => (
  <View style={styles.snapChip}>
    <Text style={[styles.snapChipEmoji]}>{emoji}</Text>
    <Text style={[styles.snapChipCount, { color: fg }]}>{count}</Text>
    <Text style={styles.snapChipLabel}>{label}</Text>
  </View>
);

function jobStateColor(state: string | undefined) {
  switch (state) {
    case 'running':  return { color: '#16A34A' };
    case 'paused':   return { color: '#FBBF24' };
    case 'failed':   return { color: '#DC2626' };
    case 'done':     return { color: '#007AFF' };
    case 'queued':   return { color: neutral.inkMuted };
    default:         return { color: neutral.inkMuted };
  }
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0006' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: 64,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  handle: { width: 40, height: 4, backgroundColor: neutral.border, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  headerRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 2 },
  headerTitle: { ...type.title, color: neutral.ink, fontSize: 19 },
  headerSubtitle: { ...type.captionSm, color: neutral.inkMuted },
  section: { marginBottom: 14 },
  sectionTitle: { ...type.captionXs, color: neutral.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingHorizontal: 4 },
  sectionBody: { backgroundColor: neutral.bg, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border, padding: 10, gap: 8 },
  label: { ...type.captionSm, color: neutral.inkSoft, fontSize: 11 },
  hint: { ...type.captionSm, color: neutral.inkMuted, fontStyle: 'italic', marginTop: 2 },
  probeText: { ...type.caption, fontWeight: '600' },
  modelStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  modelChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: neutral.surface, borderWidth: 1, borderColor: neutral.border, fontSize: 11, color: neutral.ink, fontFamily: 'Courier' },
  modelChipActive: { borderColor: '#007AFF', backgroundColor: '#FFD1DC', color: neutral.ink },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  toggleLabel: { ...type.body, color: neutral.ink, flex: 1 },

  capsModel: { ...type.captionSm, color: neutral.inkMuted, fontFamily: 'Courier', flex: 1, minWidth: 0 },
  capsGrid: { gap: 4 },
  capsItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: neutral.surface },
  capsItemOn: {},
  capsItemOff: { opacity: 0.55 },
  capsItemMark: { fontSize: 14, fontWeight: '700', width: 14, textAlign: 'center' },
  capsItemMarkOn: { color: neutral.ok },
  capsItemMarkOff: { color: neutral.inkMuted },
  capsItemLabel: { ...type.body, color: neutral.ink, fontSize: 12 },
  capsItemBlurb: { ...type.captionXs, color: neutral.inkMuted, marginTop: 1 },

  skillCount: { ...type.captionSm, color: neutral.inkMuted },
  snapChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm, backgroundColor: neutral.surface,
    borderWidth: 1, borderColor: neutral.border,
  },
  snapChipEmoji: { fontSize: 12 },
  snapChipCount: { ...type.uiBold, fontSize: 12 },
  snapChipLabel: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10 },
  listGrid: { gap: 4 },
  listItem: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: neutral.surface, gap: 2 },
  listItemId: { ...type.captionXs, color: neutral.inkMuted, fontFamily: 'Courier' },
  listItemName: { ...type.uiBold, color: neutral.ink, fontSize: 12 },
  listItemDesc: { ...type.captionXs, color: neutral.inkMuted, marginTop: 1 },
  jobState: { ...type.captionXs, color: neutral.inkMuted, fontFamily: 'Courier', marginLeft: 'auto' },

  accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accentCard: {
    width: '48%', padding: space.sm,
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border,
    backgroundColor: neutral.surface,
  },
  // accentCardActive is computed inline against the live accent
  accentSwatch: { width: 24, height: 24, borderRadius: 12 },
  accentLabel: { ...type.body, color: neutral.ink, fontSize: 12 },
  accentHint: { ...type.captionXs, color: neutral.inkMuted, fontFamily: 'Courier' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
});
