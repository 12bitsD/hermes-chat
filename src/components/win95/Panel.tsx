import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { neutral, radius } from '../../theme';

export interface PanelProps extends ViewProps {
  variant?: 'flat' | 'card';
  background?: string;
  radius?: number;
  padding?: number;
}

/**
 * Panel — flat surface. Two modes:
 *   - flat (default): just a background fill, no border
 *   - card: 1px border + light background, like a Notion card
 */
export const Panel: React.FC<PanelProps> = ({
  variant = 'flat',
  background = neutral.surface,
  radius: r = radius.md,
  padding,
  style,
  children,
  ...rest
}) => {
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: background, borderRadius: r },
        padding != null ? { padding } : null,
        variant === 'card' ? styles.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: neutral.border,
  },
});
