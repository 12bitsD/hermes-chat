import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { neutral, type, space, radius } from '../../theme';

export interface FileCardProps {
  name: string;
  kind: 'pdf' | 'ppt' | 'image' | 'text' | 'other';
  size: number;
  uri: string;
  previewUri?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  previewContent?: string;
  pageCount?: number;
}

const KIND_ICON: Record<FileCardProps['kind'], string> = {
  pdf: '📄',
  ppt: '📊',
  image: '🖼️',
  text: '📝',
  other: '📁',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const FileCard: React.FC<FileCardProps> = ({
  name, kind, size, uri, previewUri, expanded = false, onToggle, onRemove, previewContent, pageCount,
}) => {
  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={onToggle}>
        <Text style={styles.icon}>{KIND_ICON[kind]}</Text>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
          <Text style={styles.meta}>
            {kind.toUpperCase()} · {formatSize(size)}
            {pageCount ? ` · ${pageCount} pages` : ''}
          </Text>
        </View>
        {onRemove ? (
          <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
            <Text style={styles.removeBtnText}>×</Text>
          </Pressable>
        ) : null}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {previewUri && kind === 'image' ? (
            <View style={styles.previewWrap}>
              {Platform.OS === 'web' ? (
                <img src={previewUri} alt={name} style={styles.previewImg as any} />
              ) : (
                <Text style={styles.placeholderText}>🖼 {name}</Text>
              )}
            </View>
          ) : previewContent ? (
            <ScrollView style={styles.textPreview}>
              <Text style={styles.textPreviewContent}>{previewContent.slice(0, 2000)}</Text>
              {previewContent.length > 2000 ? (
                <Text style={styles.textPreviewMore}>(truncated, {previewContent.length - 2000} more chars)</Text>
              ) : null}
            </ScrollView>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>{KIND_ICON[kind]}</Text>
              <Text style={styles.placeholderText}>
                {kind === 'pdf' ? 'PDF preview — first page will render in Phase 2B'
                  : kind === 'ppt' ? 'PPT slide thumbnails — Phase 2C'
                  : 'No preview available'}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
};

// ─── Pickers (platform-aware) ──────────────────────────────────────────────────

export interface PickedFile {
  name: string;
  size: number;
  uri: string;
  kind: FileCardProps['kind'];
  previewContent?: string;
  mimeType?: string;
}

export async function pickFile(): Promise<PickedFile | null> {
  if (Platform.OS === 'web') return pickFileWeb();
  return pickFileNative();
}

async function pickFileNative(): Promise<PickedFile | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    const kind = guessKindFromName(a.name, a.mimeType ?? '');
    let previewContent: string | undefined;
    if (kind === 'text') {
      try {
        previewContent = await FileSystem.readAsStringAsync(a.uri, { encoding: 'utf8' });
      } catch { /* ignore */ }
    }
    return {
      name: a.name, size: a.size ?? 0, uri: a.uri, kind, previewContent,
      mimeType: a.mimeType ?? undefined,
    };
  } catch (e) {
    console.warn('[pickFileNative] failed', e);
    return null;
  }
}

async function pickFileWeb(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      const kind = guessKindFromName(f.name, f.type);
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: f.name, size: f.size, uri: reader.result as string, kind,
          previewContent: kind === 'text' ? (reader.result as string) : undefined,
          mimeType: f.type || undefined,
        });
      };
      if (kind === 'text') reader.readAsText(f);
      else reader.readAsDataURL(f);
    };
    input.click();
  });
}

function guessKindFromName(name: string, mime: string): FileCardProps['kind'] {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.includes('presentation') || /\.(pptx|ppt)$/i.test(name)) return 'ppt';
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name)) return 'image';
  if (mime.startsWith('text/') || /\.(md|txt|json|js|ts|py|css|html|xml|yaml|yml|csv)$/i.test(name)) return 'text';
  return 'other';
}

// ─── Attach zone (lightweight) ────────────────────────────────────────────────

export interface AttachZoneProps {
  onFilePicked: (file: PickedFile) => void;
  children?: React.ReactNode;
  buttonLabel?: string;
}

export const AttachZone: React.FC<AttachZoneProps> = ({ onFilePicked, children, buttonLabel }) => {
  const [hovering, setHovering] = useState(false);
  const webDropProps: any = Platform.OS === 'web'
    ? {
        onDragOver: (e: DragEvent) => { e.preventDefault(); setHovering(true); },
        onDragLeave: () => setHovering(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setHovering(false);
          pickFileWeb().then((f) => f && onFilePicked(f));
        },
      }
    : {};

  const onTap = useCallback(async () => {
    const f = await pickFile();
    if (f) onFilePicked(f);
  }, [onFilePicked]);

  return (
    <View
      {...webDropProps}
      style={[styles.drop, hovering ? styles.dropHover : null]}
    >
      {children}
      <Pressable onPress={onTap} style={({ pressed }) => [styles.attachBtn, pressed ? styles.attachBtnPressed : null]}>
        <Text style={styles.attachBtnText}>📎 {buttonLabel ?? 'Attach'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: neutral.surface,
    borderWidth: 1, borderColor: neutral.border,
    borderRadius: radius.md,
    marginVertical: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: space.sm },
  icon: { fontSize: 18, marginRight: space.sm },
  headerText: { flex: 1 },
  name: { ...type.uiBold, color: neutral.ink },
  meta: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  removeBtnText: { ...type.uiBold, color: neutral.err, fontSize: 16 },
  chevron: { ...type.caption, color: neutral.inkMuted, marginLeft: space.xs },
  body: { backgroundColor: neutral.bg, padding: space.sm, borderTopWidth: 1, borderTopColor: neutral.border },
  previewWrap: { alignItems: 'center' },
  previewImg: { maxWidth: '100%', maxHeight: 200, objectFit: 'contain' } as any,
  textPreview: { maxHeight: 160 },
  textPreviewContent: { ...type.code, color: neutral.ink },
  textPreviewMore: { ...type.caption, color: neutral.inkMuted, fontStyle: 'italic', marginTop: 4 },
  placeholder: { alignItems: 'center', padding: space.lg, opacity: 0.7 },
  placeholderIcon: { fontSize: 28, marginBottom: 4 },
  placeholderText: { ...type.caption, color: neutral.inkMuted, fontStyle: 'italic', textAlign: 'center' },

  drop: { position: 'relative' },
  dropHover: { backgroundColor: neutral.surfaceMuted },
  attachBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: neutral.surface,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  attachBtnPressed: { backgroundColor: neutral.surfaceMuted },
  attachBtnText: { ...type.caption, color: neutral.inkSoft },
});
