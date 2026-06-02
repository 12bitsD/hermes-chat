import React, { useState, useCallback } from 'react';
import { Pressable, Text, View, StyleSheet, TextStyle, ViewStyle, GestureResponderEvent } from 'react-native';
import { palette, type, space } from '../../theme';

export interface Win95ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  default?: boolean; // visually "primary" — thick blue outline
  small?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

/**
 * Win95 push button. Two states: raised (idle) and pressed (active).
 * "Default" gets the dotted focus ring.
 */
export const Win95Button: React.FC<Win95ButtonProps> = ({
  label,
  onPress,
  disabled = false,
  default: isDefault = false,
  small = false,
  style,
  textStyle,
  testID,
}) => {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      hitSlop={4}
      style={[
        styles.base,
        small ? styles.small : styles.normal,
        pressed ? styles.pressed : styles.raised,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          small ? styles.labelSmall : null,
          pressed ? styles.labelPressed : null,
          disabled ? styles.labelDisabled : null,
          textStyle,
        ]}
      >
        {label}
      </Text>
      {isDefault && focused ? <View style={styles.focusOutline} pointerEvents="none" /> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  normal: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    minHeight: 30,
    minWidth: 75,
  },
  small: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    minHeight: 22,
    minWidth: 50,
  },
  raised: {
    borderTopColor: palette.bevelHi,
    borderLeftColor: palette.bevelHi,
    borderRightColor: palette.bevelLo,
    borderBottomColor: palette.bevelLo,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  pressed: {
    borderTopColor: palette.bevelLo,
    borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    paddingTop: space.xs + 1, // shift text 1px to mimic sun-key indent
  },
  disabled: { opacity: 0.5 },
  label: { ...type.ui, color: palette.ink },
  labelSmall: { fontSize: 10 },
  labelPressed: { paddingTop: 1 },
  labelDisabled: { color: palette.bevelDark },
  focusOutline: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderStyle: 'dotted',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
});
