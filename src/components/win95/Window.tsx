import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { TitleBar, TitleBarProps } from './TitleBar';
import { palette, bevel, space } from '../../theme';

export interface WindowProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  active?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  variant?: TitleBarProps['variant'];
  fullWidth?: boolean;
  fullHeight?: boolean;
}

/**
 * Window — outer chrome: title bar + raised gray frame.
 * Inner content area should be a sunken <Panel variant="inset"> or white <Panel background={paper}>.
 */
export const Window: React.FC<WindowProps> = ({
  title,
  children,
  onClose,
  onMinimize,
  onMaximize,
  active = true,
  style,
  contentStyle,
  variant,
  fullWidth = false,
  fullHeight = false,
}) => {
  return (
    <View
      style={[
        styles.outer,
        bevel.raised,
        {
          backgroundColor: palette.surface,
          alignSelf: fullWidth ? 'stretch' : undefined,
          flexGrow: fullHeight ? 1 : undefined,
        },
        style,
      ]}
    >
      <TitleBar
        title={title}
        active={active}
        onClose={onClose}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        variant={variant}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    padding: space.xs,
  },
});
