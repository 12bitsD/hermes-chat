import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { neutral, type, space, radius } from '../../theme';
import type { Attachment } from '../../types';

export interface FileCardProps {
  name: string;
  kind: Attachment['kind'];
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
  name, kind, size, previewUri, expanded = false, onToggle, onRemove, previewContent, pageCount,
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

});
