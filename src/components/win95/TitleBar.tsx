import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { palette, type, space } from '../../theme';

export interface TitleBarProps {
  title: string;
  active?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  style?: ViewStyle;
  variant?: 'window' | 'menu';
}

export const TitleBar: React.FC<TitleBarProps> = ({
  title,
  active = true,
  onClose,
  onMinimize,
  onMaximize,
  style,
  variant = 'window',
}) => {
  const bg = active ? palette.titlebarActive : palette.titlebarInactive;
  const fg = active ? palette.titlebarActiveText : palette.titlebarInactiveText;

  return (
    <View style={[styles.row, { backgroundColor: bg }, style]}>
      {variant === 'window' ? <View style={styles.icon} /> : null}
      <Text numberOfLines={1} style={[styles.title, { color: fg }]}>
        {title}
      </Text>
      {variant === 'window' ? (
        <View style={styles.controls}>
          {onMinimize ? <TitleButton label="_" onPress={onMinimize} active={active} /> : null}
          {onMaximize ? <TitleButton label="▢" onPress={onMaximize} active={active} /> : null}
          {onClose ? <TitleButton label="✕" onPress={onClose} active={active} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const TitleButton: React.FC<{ label: string; onPress: () => void; active: boolean }> = ({
  label,
  onPress,
  active,
}) => {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.ctrl,
        pressed ? styles.ctrlPressed : styles.ctrlRaised,
      ]}
    >
      <Text style={[styles.ctrlLabel, { color: active ? palette.ink : palette.bevelDark }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    paddingHorizontal: space.xs,
  },
  icon: {
    width: 16,
    height: 16,
    marginRight: space.xs,
    backgroundColor: palette.hotPink,
  },
  title: { ...type.uiBold, flex: 1 },
  controls: { flexDirection: 'row' },
  ctrl: {
    width: 18,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  ctrlRaised: {
    backgroundColor: palette.surface,
    borderTopColor: palette.bevelHi,
    borderLeftColor: palette.bevelHi,
    borderRightColor: palette.bevelLo,
    borderBottomColor: palette.bevelLo,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  ctrlPressed: {
    backgroundColor: palette.surface,
    borderTopColor: palette.bevelLo,
    borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  ctrlLabel: { fontSize: 10, fontWeight: 'bold', lineHeight: 12 },
});
