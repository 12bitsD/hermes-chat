import React, { useState, useCallback } from 'react';
import { Pressable, Text, StyleSheet, TextStyle, ViewStyle, GestureResponderEvent } from 'react-native';
import { neutral, type, space, radius } from '../../theme';
import { useTheme } from '../../theme';

export interface Win95ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  default?: boolean; // primary (filled with accent)
  small?: boolean;
  ghost?: boolean;   // transparent until pressed
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

/**
 * Flat button. Two visual variants:
 *   - filled (default true) for primary actions: accent bg, white text
 *   - ghost: transparent, accent text, light hover background
 * No 3D bevels, no dotted focus ring, no sun-key indent — just a soft press state.
 */
export const Win95Button: React.FC<Win95ButtonProps> = ({
  label,
  onPress,
  disabled = false,
  default: isDefault = false,
  small = false,
  ghost = false,
  style,
  textStyle,
  testID,
}) => {
  const accent = useTheme();
  const [pressed, setPressed] = useState(false);
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);

  // Resolve colors based on variant + state
  const filled = isDefault && !ghost;
  const bg = filled
    ? (pressed ? accent.accent.fg : accent.accent.fg)
    : (pressed ? accent.accent.soft : 'transparent');
  const fg = filled ? accent.accent.fgOn : accent.accent.fg;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={4}
      style={[
        styles.base,
        small ? styles.small : styles.normal,
        { backgroundColor: bg, borderRadius: radius.md },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          small ? styles.labelSmall : null,
          { color: fg, opacity: disabled ? 0.4 : 1 },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  normal: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 36,
    minWidth: 64,
  },
  small: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs + 1,
    minHeight: 28,
    minWidth: 0,
  },
  label: { ...type.uiBold, fontSize: 13 },
  labelSmall: { fontSize: 12 },
});
