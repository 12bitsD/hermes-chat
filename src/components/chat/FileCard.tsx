import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { palette, type, space, bevel } from '../../theme';

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
    <View style={[styles.card, bevel.raised]}>
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
        <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
      </Pressable>

      {expanded ? (
        <View style={[styles.body, bevel.inset]}>
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

/**
 * Pick a file. On Android/iOS uses the native document picker (returns a URI
 * pointing at the OS file). On web uses an HTML <input type=file>.
 *
 * Both paths normalize into a PickedFile.
 */
export async function pickFile(): Promise<PickedFile | null> {
  if (Platform.OS === 'web') {
    return pickFileWeb();
  }
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
      } catch {
        // ignore — preview is optional
      }
    }
    return {
      name: a.name,
      size: a.size ?? 0,
      uri: a.uri,
      kind,
      previewContent,
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
          name: f.name,
          size: f.size,
          uri: reader.result as string,
          kind,
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

// ─── Drop / Tap zone wrapper ──────────────────────────────────────────────────

export interface AttachZoneProps {
  onFilePicked: (file: PickedFile) => void;
  children?: React.ReactNode;
  buttonLabel?: string;
}

/**
 * AttachZone — wraps the composer with a tap (and web drag-drop) target so
 * users can attach files inline. On Android/iOS this surfaces the system
 * document picker; on web it accepts drag-drop AND the same tap → file input.
 */
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
    backgroundColor: palette.surface,
    marginVertical: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: 6 },
  icon: { fontSize: 20, marginRight: 8 },
  headerText: { flex: 1 },
  name: { ...type.uiBold, color: palette.ink },
  meta: { ...type.ui, color: palette.inkMuted, fontSize: 10 },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  removeBtnText: { ...type.uiBold, color: palette.err, fontSize: 16 },
  chevron: { ...type.ui, color: palette.ink, marginLeft: 4 },
  body: { backgroundColor: palette.paper, padding: 6, margin: 4 },
  previewWrap: { alignItems: 'center' },
  previewImg: { maxWidth: '100%', maxHeight: 200, objectFit: 'contain' } as any,
  textPreview: { maxHeight: 160 },
  textPreviewContent: { ...type.code, color: palette.ink },
  textPreviewMore: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic', marginTop: 4 },
  placeholder: { alignItems: 'center', padding: 16, opacity: 0.6 },
  placeholderIcon: { fontSize: 32, marginBottom: 4 },
  placeholderText: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic' },

  drop: { position: 'relative' },
  dropHover: { backgroundColor: palette.cyberBlue, opacity: 0.9 },
  attachBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopColor: palette.bevelHi,
    borderLeftColor: palette.bevelHi,
    borderRightColor: palette.bevelLo,
    borderBottomColor: palette.bevelLo,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  attachBtnPressed: {
    borderTopColor: palette.bevelLo,
    borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
  },
  attachBtnText: { ...type.ui, color: palette.ink },
});
