import { useCallback, useEffect, useState } from 'react';
import { fetchCapabilities, type HermesCapabilities } from '../../services/llm/capabilities';
import { fetchSkills, fetchToolsets, type HermesSkill, type HermesToolset } from '../../services/llm/discovery';
import { buildLLMConfigFromDraft, createGatewayClient, createJobsClient, createSessionsClient } from '../../services/llm/factory';
import type { HermesJob } from '../../services/llm/jobs-client';
import type { HermesSession } from '../../services/llm/sessions-client';
import { gatewayV1Url } from '../../services/llm/url';
import { useAppStore } from '../../store/app';
import { syncLLMFromSettings } from '../../store/persistence';
import { haptic } from '../../utils/haptic';

export function useSettingsController(open: boolean, onClose: () => void) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [endpoint, setEndpoint] = useState(settings.llmEndpoint);
  const [apiKey, setApiKey] = useState(settings.llmApiKey);
  const [model, setModel] = useState(settings.llmModel);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [temperature, setTemperature] = useState(String(settings.temperature ?? ''));
  const [maxTokens, setMaxTokens] = useState(String(settings.maxTokens ?? ''));
  const [streamChunkMs, setStreamChunkMs] = useState(String(settings.streamChunkMs));
  const [haptics, setHaptics] = useState(settings.enableHaptics);
  const [accentKey, setAccentKey] = useState(settings.accent);
  const [sessionKey, setSessionKey] = useState(settings.sessionKey ?? '');
  const [useRunsMode, setUseRunsMode] = useState(settings.useRunsMode ?? false);

  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [caps, setCaps] = useState<HermesCapabilities | null>(null);
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [skills, setSkills] = useState<HermesSkill[] | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [toolsets, setToolsets] = useState<HermesToolset[] | null>(null);
  const [loadingToolsets, setLoadingToolsets] = useState(false);
  const [sessions, setSessions] = useState<HermesSession[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [jobs, setJobs] = useState<HermesJob[] | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const draftConfig = useCallback(() => buildLLMConfigFromDraft({ endpoint, apiKey, model }), [endpoint, apiKey, model]);

  useEffect(() => {
    if (!open) return;
    setEndpoint(settings.llmEndpoint);
    setApiKey(settings.llmApiKey);
    setModel(settings.llmModel);
    setSystemPrompt(settings.systemPrompt);
    setTemperature(String(settings.temperature ?? ''));
    setStreamChunkMs(String(settings.streamChunkMs));
    setHaptics(settings.enableHaptics);
    setAccentKey(settings.accent);
    setMaxTokens(String(settings.maxTokens ?? ''));
    setSessionKey(settings.sessionKey ?? '');
    setUseRunsMode(settings.useRunsMode ?? false);
    setProbeResult(null);
    setModels([]);
  }, [open, settings]);

  const probe = useCallback(async () => {
    haptic('light');
    setProbing(true);
    setProbeResult(null);
    try {
      const result = await createGatewayClient(draftConfig()).isReachable();
      setProbeResult({ ok: result.ok, msg: result.message });
      haptic(result.ok ? 'success' : 'error');
    } catch (error: any) {
      setProbeResult({ ok: false, msg: `Probe failed: ${error?.message ?? error}` });
      haptic('error');
    } finally {
      setProbing(false);
    }
  }, [draftConfig]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const base = gatewayV1Url(draftConfig().endpoint);
      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const res = await fetch(`${base}/v1/models`, { method: 'GET', headers });
      if (!res.ok) {
        setModels([]);
        haptic('warning');
        return;
      }
      const json: any = await res.json();
      const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      setModels(arr.map((item) => ({ id: item.id, label: item.id })));
      haptic(arr.length ? 'success' : 'warning');
    } catch {
      setModels([]);
      haptic('error');
    } finally {
      setLoadingModels(false);
    }
  }, [apiKey, draftConfig]);

  const fetchCapabilitiesNow = useCallback(async () => {
    setLoadingCaps(true);
    try {
      const result = await fetchCapabilities(draftConfig());
      setCaps(result);
      haptic(result ? 'success' : 'warning');
    } catch {
      setCaps(null);
      haptic('error');
    } finally {
      setLoadingCaps(false);
    }
  }, [draftConfig]);

  const fetchSkillsNow = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const result = await fetchSkills(draftConfig());
      setSkills(result);
      haptic(result ? (result.length ? 'success' : 'warning') : 'error');
    } catch {
      setSkills(null);
      haptic('error');
    } finally {
      setLoadingSkills(false);
    }
  }, [draftConfig]);

  const fetchToolsetsNow = useCallback(async () => {
    setLoadingToolsets(true);
    try {
      const result = await fetchToolsets(draftConfig());
      setToolsets(result);
      haptic(result ? (result.length ? 'success' : 'warning') : 'error');
    } catch {
      setToolsets(null);
      haptic('error');
    } finally {
      setLoadingToolsets(false);
    }
  }, [draftConfig]);

  const fetchSessionsNow = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await createSessionsClient(draftConfig()).list();
      setSessions(list);
      haptic(list ? (list.length ? 'success' : 'warning') : 'error');
    } catch {
      setSessions(null);
      haptic('error');
    } finally {
      setLoadingSessions(false);
    }
  }, [draftConfig]);

  const fetchJobsNow = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const list = await createJobsClient(draftConfig()).list();
      setJobs(list);
      haptic(list ? (list.length ? 'success' : 'warning') : 'error');
    } catch {
      setJobs(null);
      haptic('error');
    } finally {
      setLoadingJobs(false);
    }
  }, [draftConfig]);

  useEffect(() => {
    if (!open) return;
    if (!caps && !loadingCaps) fetchCapabilitiesNow();
    if (!skills && !loadingSkills) fetchSkillsNow();
    if (!toolsets && !loadingToolsets) fetchToolsetsNow();
    if (sessions === null && !loadingSessions) fetchSessionsNow();
    if (jobs === null && !loadingJobs) fetchJobsNow();
  }, [open]);

  const runJobAction = useCallback(async (id: string, action: 'run' | 'pause' | 'resume') => {
    const client = createJobsClient(draftConfig());
    const ok = action === 'run'
      ? await client.run(id)
      : action === 'pause'
        ? await client.pause(id)
        : await client.resume(id);
    haptic(ok ? 'success' : 'error');
    fetchJobsNow();
  }, [draftConfig, fetchJobsNow]);

  const save = useCallback(() => {
    updateSettings({
      llmProvider: 'hermes-gateway',
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
    });
    syncLLMFromSettings();
    haptic('success');
    onClose();
  }, [endpoint, apiKey, model, systemPrompt, temperature, streamChunkMs, haptics, accentKey, maxTokens, sessionKey, useRunsMode, updateSettings, onClose]);

  return {
    settings,
    endpoint,
    setEndpoint,
    apiKey,
    setApiKey,
    model,
    setModel,
    systemPrompt,
    setSystemPrompt,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    streamChunkMs,
    setStreamChunkMs,
    haptics,
    setHaptics,
    accentKey,
    setAccentKey,
    sessionKey,
    setSessionKey,
    useRunsMode,
    setUseRunsMode,
    probing,
    probeResult,
    models,
    loadingModels,
    caps,
    loadingCaps,
    skills,
    loadingSkills,
    toolsets,
    loadingToolsets,
    sessions,
    loadingSessions,
    jobs,
    loadingJobs,
    probe,
    fetchModels,
    fetchCapabilitiesNow,
    fetchSkillsNow,
    fetchToolsetsNow,
    fetchSessionsNow,
    fetchJobsNow,
    runJob: (id: string) => runJobAction(id, 'run'),
    pauseJob: (id: string) => runJobAction(id, 'pause'),
    resumeJob: (id: string) => runJobAction(id, 'resume'),
    save,
  };
}
