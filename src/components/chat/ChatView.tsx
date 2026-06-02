import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, Platform } from 'react-native';
import { palette, type, space, bevel } from '../../theme';
import { TextField, Button } from '../win95';
import { MessageBubble } from './MessageBubble';
import { AttachZone, PickedFile, FileCard } from './FileCard';
import { useAppStore } from '../../store/app';
import { streamMockReply, makeUserMessage, makeAssistantMessage } from '../../services/mock-llm';

export const ChatView: React.FC = () => {
  const conversationId = useAppStore((s) => s.activeConversationId);
  const messages = useAppStore((s) => s.getActiveMessages());
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const showIllustrations = useAppStore((s) => s.settings.showIllustrations);

  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onInsert = (e: Event) => {
      const body = (e as CustomEvent<string>).detail ?? '';
      if (!body) return;
      setInput((cur) => (cur ? cur + '\n\n' + body : body));
    };
    window.addEventListener('hermes:insert-prompt', onInsert);
    return () => window.removeEventListener('hermes:insert-prompt', onInsert);
  }, []);

  const onFilePicked = useCallback((f: PickedFile) => {
    setPendingFiles((cur) => [...cur, f]);
  }, []);

  const removeFile = useCallback((uri: string) => {
    setPendingFiles((cur) => cur.filter((f) => f.uri !== uri));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !conversationId) return;
    Keyboard.dismiss();
    setInput('');

    const userMsg = makeUserMessage(text);
    // Attach files as message attachments (visual cards in the message)
    if (pendingFiles.length > 0) {
      userMsg.attachments = pendingFiles.map((f) => ({
        id: f.uri,
        name: f.name,
        kind: f.kind,
        size: f.size,
        uri: f.uri,
        previewUri: f.kind === 'image' ? f.uri : undefined,
      }));
    }
    const assistantMsg = makeAssistantMessage('');

    appendMessage(conversationId, userMsg);
    appendMessage(conversationId, assistantMsg);
    setPendingFiles([]);

    setStreaming(true);
    abortRef.current = new AbortController();
    try {
      let acc = '';
      for await (const chunk of streamMockReply(text, abortRef.current.signal)) {
        acc += chunk;
        updateMessage(conversationId, assistantMsg.id, { content: acc });
      }
      updateMessage(conversationId, assistantMsg.id, { status: 'done' });
    } catch (e) {
      updateMessage(conversationId, assistantMsg.id, { status: 'error', content: `**Error**: ${String(e)}` });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, conversationId, appendMessage, updateMessage, pendingFiles]);

  const onKeyPress = useCallback(
    (e: any) => {
      if ((e?.nativeEvent?.key === 'Enter') && !e?.nativeEvent?.shiftKey && Platform.OS === 'web') {
        e.preventDefault?.();
        send();
      }
    },
    [send],
  );

  const onStop = () => abortRef.current?.abort();

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, bevel.inset]}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {messages.map((m, i) => (
            <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} />
          ))}
          {messages.length === 1 && showIllustrations ? (
            <View style={styles.illustration}>
              <Text style={styles.illustrationEmoji}>🌸</Text>
              <Text style={styles.illustrationCaption}>(少女立绘占位 — Phase 3 接入 GPT Image 2)</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <AttachZone onFilePicked={onFilePicked} buttonLabel={Platform.OS === 'web' ? 'Drop / click' : 'Tap to attach'}>
        <View style={styles.composer}>
          {pendingFiles.length > 0 ? (
            <ScrollView horizontal style={styles.fileStrip} contentContainerStyle={styles.fileStripContent}>
              {pendingFiles.map((f) => (
                <View key={f.uri} style={styles.fileChip}>
                  <FileCard
                    name={f.name}
                    kind={f.kind}
                    size={f.size}
                    uri={f.uri}
                    expanded={expandedFile === f.uri}
                    onToggle={() => setExpandedFile(expandedFile === f.uri ? null : f.uri)}
                    onRemove={() => removeFile(f.uri)}
                    previewContent={f.previewContent}
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}
          <TextField
            value={input}
            onChangeText={setInput}
            onKeyPress={onKeyPress}
            placeholder="Type a message...  (Enter to send, Shift+Enter for newline)"
            multiline
            style={styles.composerInput}
          />
          <View style={styles.composerRow}>
            <Text style={styles.hint}>
              {streaming ? 'Hermes is typing…' : pendingFiles.length > 0 ? `${pendingFiles.length} file(s) attached` : 'Press Enter to send'}
            </Text>
            {streaming ? (
              <Button label="Stop" onPress={onStop} small />
            ) : (
              <Button label="Send" default onPress={send} disabled={!input.trim()} small />
            )}
          </View>
        </View>
      </AttachZone>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1, backgroundColor: palette.paper, margin: space.xs, padding: 0 },
  scroll: { flex: 1 },
  scrollContent: { padding: space.sm, paddingBottom: space.xl },
  illustration: { alignItems: 'center', marginTop: space.lg, opacity: 0.6 },
  illustrationEmoji: { fontSize: 48 },
  illustrationCaption: { ...type.ui, color: palette.inkMuted, marginTop: 4, fontStyle: 'italic' },
  composer: { paddingHorizontal: space.xs, paddingBottom: space.xs },
  fileStrip: { maxHeight: 140, marginBottom: 4 },
  fileStripContent: { paddingRight: 8 },
  fileChip: { marginRight: 4, minWidth: 220, maxWidth: 280 },
  composerInput: { minHeight: 60 },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  hint: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic' },
});
