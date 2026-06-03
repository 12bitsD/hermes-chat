/**
 * QuickActionSheet — bottom-sheet style modal for the EmptyState quick
 * actions (Jobs / Tool / Activity). Renders a translucent backdrop and
 * a slide-up card with a list of items the user can tap.
 *
 * Why a custom sheet instead of using a system Modal: hermes-chat is
 * built on a kawaii flat aesthetic and we want consistent radius /
 * shadows across the app. Reusing the SettingsPanel sheet pattern
 * (style `Sheet` + `Backdrop`) keeps the look uniform.
 *
 * Cross-platform: on web the backdrop is `position: fixed`, on native
 * it's `position: absolute` over the chat. We don't rely on the
 * system ActionSheet (iOS-only) so the same UX is available on
 * Android + web.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { neutral, type, space, radius } from '../../theme';

export interface QuickActionSheetItem {
  id: string;
  emoji: string;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface QuickActionSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: QuickActionSheetItem[];
  onClose: () => void;
  emptyText?: string;
  loading?: boolean;
}

export const QuickActionSheet: React.FC<QuickActionSheetProps> = ({
  visible,
  title,
  subtitle,
  items,
  onClose,
  emptyText = 'Nothing here yet — try again in a minute.',
  loading = false,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={neutral.inkMuted} />
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : items.length === 0 ? (
              <Text style={styles.emptyText}>{emptyText}</Text>
            ) : (
              items.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() => { if (!it.disabled) { it.onPress(); onClose(); } }}
                  disabled={it.disabled}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && !it.disabled ? styles.itemPressed : null,
                    it.disabled ? styles.itemDisabled : null,
                  ]}
                >
                  <Text style={styles.itemEmoji}>{it.emoji}</Text>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{it.title}</Text>
                    {it.subtitle ? (
                      <Text style={styles.itemSubtitle} numberOfLines={2}>{it.subtitle}</Text>
                    ) : null}
                  </View>
                  {it.badge ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>{it.badge}</Text></View>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0006' },
  sheet: {
    backgroundColor: neutral.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: neutral.border,
    alignSelf: 'center', marginBottom: space.sm,
  },
  title: { ...type.title, color: neutral.ink, fontSize: 17, marginBottom: 2 },
  subtitle: { ...type.caption, color: neutral.inkMuted, marginBottom: space.sm },
  list: { marginTop: space.xs },
  listContent: { paddingBottom: space.sm },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  itemPressed: { backgroundColor: neutral.surfaceMuted },
  itemDisabled: { opacity: 0.4 },
  itemEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  itemMain: { flex: 1 },
  itemTitle: { ...type.body, color: neutral.ink, fontSize: 14 },
  itemSubtitle: { ...type.captionSm, color: neutral.inkMuted, marginTop: 1 },
  badge: {
    backgroundColor: '#FFB6C1', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText: { ...type.body, color: neutral.inkMuted, paddingVertical: 12, textAlign: 'center' },
  loading: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  cancel: {
    marginTop: space.sm, paddingVertical: 12,
    backgroundColor: neutral.surfaceMuted,
    borderRadius: radius.md, alignItems: 'center',
  },
  cancelText: { ...type.uiBold, color: neutral.ink, fontSize: 14 },
});
