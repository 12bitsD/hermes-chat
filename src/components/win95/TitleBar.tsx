import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { neutral, type, space, radius } from '../../theme';

export interface TitleBarProps {
  title: string;
  active?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  style?: ViewStyle;
  variant?: 'window' | 'menu' | 'plain'; // plain = no controls at all
}

/**
 * TitleBar — kept as a thin semantic wrapper. In the flat design, the
 * "title" is just a 16/600 Text label on a transparent row. Close/min/max
 * controls are rendered as ghost icon buttons.
 */
export const TitleBar: React.FC<TitleBarProps> = ({
  title,
  active = true,
  onClose,
  onMinimize,
  onMaximize,
  style,
  variant = 'window',
}) => {
  return (
    <View style={[styles.row, style]}>
      {variant === 'window' ? <View style={styles.icon} /> : null}
      <Text numberOfLines={1} style={[styles.title, { opacity: active ? 1 : 0.5 }]}>
        {title}
      </Text>
      {variant === 'window' ? (
        <View style={styles.controls}>
          {onMinimize ? <TitleButton label="—" onPress={onMinimize} /> : null}
          {onMaximize ? <TitleButton label="▢" onPress={onMaximize} /> : null}
          {onClose ? <TitleButton label="✕" onPress={onClose} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const TitleButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.ctrl,
        { backgroundColor: pressed ? neutral.surfaceMuted : 'transparent' },
      ]}
    >
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: space.sm,
  },
  icon: {
    width: 12,
    height: 12,
    marginRight: space.sm,
    backgroundColor: neutral.ink,
    borderRadius: 2,
  },
  title: { ...type.title, color: neutral.ink, flex: 1 },
  controls: { flexDirection: 'row', gap: 2 },
  ctrl: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  ctrlLabel: { color: neutral.inkMuted, fontSize: 12, lineHeight: 14 },
});
