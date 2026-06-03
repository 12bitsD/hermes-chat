import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { useAppStore } from '../../store/app';
import { ChatView } from '../chat/ChatView';
import { PromptNavigator } from '../prompt-nav/PromptNavigator';
import { timeAgo } from '../../utils/time';

export interface DesktopLayoutProps {
  onOpenSettings: () => void;
  onOpenDrawer: () => void;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({ onOpenSettings, onOpenDrawer }) => {
  const accent = useTheme();
  const conversations = useAppStore((s) => s.conversations);
  const order = useAppStore((s) => s.conversationOrder);
  const activeId = useAppStore((s) => s.activeConversationId);
  const setActive = useAppStore((s) => s.setActiveConversation);
  const createConv = useAppStore((s) => s.createConversation);
  const deleteConv = useAppStore((s) => s.deleteConversation);

  return (
    <View style={styles.desktopBody}>
      <View style={styles.rail}>
        <View style={styles.railHeader}>
          <Text style={styles.railTitle}>Sessions</Text>
          <Pressable hitSlop={8} onPress={() => createConv()}>
            <Text style={[styles.railAction, { color: accent.accent.fg }]}>+ New</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.railList} contentContainerStyle={{ padding: space.xs }}>
          {order.map((id) => {
            const conversation = conversations[id];
            if (!conversation) return null;
            const isActive = id === activeId;
            return (
              <Pressable
                key={id}
                onPress={() => setActive(id)}
                onLongPress={() => deleteConv(id)}
                style={({ pressed }) => [
                  styles.railItem,
                  isActive ? [styles.railItemActive, { backgroundColor: accent.accent.soft }] : null,
                  pressed ? styles.railItemPressed : null,
                ]}
              >
                <Text numberOfLines={1} style={[styles.railItemText, isActive ? styles.railItemTextActive : null]}>
                  {conversation.title}
                </Text>
                <Text numberOfLines={1} style={[styles.railItemMeta, isActive ? styles.railItemTextActive : null]}>
                  {conversation.messages.length} msg · {timeAgo(conversation.updatedAt)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.railHint}>Long-press to delete</Text>
      </View>

      <View style={styles.desktopCenter}>
        <ChatView onOpenDrawer={onOpenDrawer} />
      </View>

      <View style={styles.desktopRight}>
        <PromptNavigator
          onInsertPrompt={(body) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('hermes:insert-prompt', { detail: body }));
            }
          }}
        />
        <Pressable onPress={onOpenSettings} style={styles.desktopSettingsBtn}>
          <Text style={[styles.desktopSettingsText, { color: accent.accent.fg }]}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  desktopBody: { flex: 1, flexDirection: 'row' },
  desktopCenter: { flex: 1 },
  desktopRight: { width: 300, marginRight: space.sm, marginVertical: space.sm, backgroundColor: neutral.surface, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border, padding: space.sm },
  desktopSettingsBtn: { marginTop: space.sm, paddingVertical: space.xs, alignItems: 'center' },
  desktopSettingsText: { ...type.uiBold, fontSize: 13 },

  rail: { width: 240, marginLeft: space.sm, marginVertical: space.sm, backgroundColor: neutral.surface, borderRadius: radius.md, borderWidth: 1, borderColor: neutral.border },
  railHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.sm, borderBottomWidth: 1, borderBottomColor: neutral.border },
  railTitle: { ...type.uiBold, color: neutral.ink, fontSize: 13 },
  railAction: { ...type.caption, fontWeight: '600' },
  railList: { flex: 1 },
  railItem: { paddingHorizontal: space.sm, paddingVertical: space.xs + 2, marginVertical: 2, borderRadius: radius.sm },
  railItemActive: {},
  railItemPressed: { backgroundColor: neutral.surfaceMuted },
  railItemText: { ...type.bodyMd, color: neutral.ink, fontSize: 14 },
  railItemTextActive: { fontWeight: '600' },
  railItemMeta: { ...type.caption, color: neutral.inkMuted, marginTop: 2 },
  railHint: { ...type.caption, color: neutral.inkMuted, textAlign: 'center', padding: space.xs, fontStyle: 'italic', borderTopWidth: 1, borderTopColor: neutral.border },
});
