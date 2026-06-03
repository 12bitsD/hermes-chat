/**
 * ApprovalToast — a non-blocking kawaii toast for low-risk tool
 * approvals. Slides down from the top of the screen, sits for 6s,
 * then auto-approves (the user looked away or genuinely doesn't
 * care). Tap = approve. Swipe right = deny.
 *
 * Why a toast instead of a modal: 80% of approvals are
 * read_file/web_search/list_dir — blocking the user on these is
 * friction. A toast keeps the conversation flowing and the
 * agent working, while still giving the user one tap to refuse.
 *
 * The 6s auto-approve default is a Phase 63 #10 R10.1 design
 * decision: if the user doesn't react in 6 seconds they probably
 * trusted the action. Power users can stop the agent with the
 * existing "Stop" button on the RunHeader.
 *
 * Cross-platform: works in web (PanResponder) and native
 * (Animated.spring). Backdrop is omitted (the toast is a
 * non-modal hint, not a prompt).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated, PanResponder, Pressable, StyleSheet, Text, View, Easing,
} from 'react-native';
import { neutral, type, radius, space } from '../theme';
import { describeToolIntent } from '../domain/tools/risk';

export interface ApprovalToastProps {
  visible: boolean;
  tool: string;
  args?: unknown;
  prompt?: string;
  onApprove: () => void;
  onDeny: () => void;
  /** Override the default 6000ms auto-approve timeout. */
  autoApproveMs?: number;
  /** Disable swipe-deny (e.g. when running in test or read-only mode). */
  enableSwipeDeny?: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  read_file: '📄', cat: '📄',
  list_dir: '📂', ls: '📂', find: '🔍', grep: '🔍',
  web_search: '🔍', search: '🔍', web_fetch: '🌐', http_get: '🌐',
  write_file: '✏️', edit_file: '✏️', create_file: '✏️',
  delete_file: '🗑', rm: '🗑',
  shell: '🔧', exec: '🔧', bash: '🔧',
  send_email: '✉️',
  default: '🔔',
};

const SWIPE_DENY_THRESHOLD = 100; // px

export const ApprovalToast: React.FC<ApprovalToastProps> = ({
  visible, tool, args, prompt, onApprove, onDeny,
  autoApproveMs = 6000, enableSwipeDeny = true,
}) => {
  const translateY = useRef(new Animated.Value(-120)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (visible) {
      dismissed.current = false;
      translateX.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, friction: 8, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      ]).start();
      timer.current = setTimeout(() => {
        if (!dismissed.current) onApprove();
      }, autoApproveMs);
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 200, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: false }),
      ]).start();
      if (timer.current) clearTimeout(timer.current);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [visible, autoApproveMs]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
    onPanResponderMove: (_, g) => {
      if (g.dx > 0) translateX.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_DENY_THRESHOLD) {
        dismissed.current = true;
        onDeny();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
      }
    },
  }), [onDeny]);

  if (!visible) return null;

  const icon = TOOL_ICONS[tool.toLowerCase()] ?? TOOL_ICONS.default;
  const intent = describeToolIntent(tool, args);
  const display = prompt || intent;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { transform: [{ translateY }, { translateX }], opacity }]}
      {...(enableSwipeDeny ? pan.panHandlers : {})}
    >
      <Pressable onPress={() => { dismissed.current = true; onApprove(); }} style={styles.body}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            Hermes wants to {tool.replace(/_/g, ' ')}
          </Text>
          <Text style={styles.detail} numberOfLines={2}>{display}</Text>
        </View>
        <View style={styles.hintCol}>
          <Text style={styles.hint}>tap ✓</Text>
          {enableSwipeDeny && <Text style={styles.hint}>swipe ✕</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 12, left: 12, right: 12,
    backgroundColor: '#FFE4EC',
    borderRadius: radius.md,
    borderWidth: 1, borderColor: '#FFB6C1',
    shadowColor: '#FFB6C1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 100,
  },
  body: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  icon: { fontSize: 26, width: 32, textAlign: 'center' },
  main: { flex: 1 },
  title: { ...type.uiBold, color: neutral.ink, fontSize: 13 },
  detail: { ...type.captionSm, color: neutral.inkMuted, marginTop: 1 },
  hintCol: { alignItems: 'flex-end' },
  hint: { ...type.captionSm, color: '#B76E79', fontSize: 10, marginVertical: 0.5 },
});
