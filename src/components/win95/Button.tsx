import React, { useState, useCallback, useRef } from 'react';
import { Pressable, Text, StyleSheet, TextStyle, ViewStyle, GestureResponderEvent, Animated, Easing } from 'react-native';
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
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 12 }).start();
  }, [scale]);
  const onPressOut = useCallback(() => {
    setPressed(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
  }, [scale]);

  // Resolve colors based on variant + state
  const filled = isDefault && !ghost;
  const bg = filled
    ? (pressed ? accent.accent.fg : accent.accent.fg)
    : (pressed ? accent.accent.soft : 'transparent');
  const fg = filled ? accent.accent.fgOn : accent.accent.fg;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
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
    </Animated.View>
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
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 1,
    minHeight: 32,
    minWidth: 0,
  },
  label: { ...type.uiBold, fontSize: 13 },
  labelSmall: { fontSize: 13, fontWeight: '600' },
});
