import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { palette, bevel, BevelKey, radius } from '../../theme';

export interface PanelProps extends ViewProps {
  variant?: BevelKey;
  background?: string;
  radius?: number;
  padding?: number;
}

/**
 * Panel — generic raised/inset/sunken surface. Use everywhere a chunk of UI
 * wants the chunky Win95 3D edge.
 */
export const Panel: React.FC<PanelProps> = ({
  variant = 'raised',
  background = palette.surface,
  radius: r = 0,
  padding,
  style,
  children,
  ...rest
}) => {
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: background },
        {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
        },
        padding != null ? { padding } : null,
        bevel[variant],
        style,
      ]}
    >
      {children}
    </View>
  );
};
