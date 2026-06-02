import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { palette, type, space } from '../../theme';

export interface MenuBarProps {
  items: string[];
  activeIndex?: number;
  onSelect?: (i: number) => void;
  style?: ViewStyle;
}

/**
 * MenuBar — the iconic top-of-window file/edit/view/help row.
 * Each item highlights when active. Press selects (toggles a dropdown above it).
 */
export const MenuBar: React.FC<MenuBarProps> = ({ items, activeIndex, onSelect, style }) => {
  return (
    <View
      // @ts-ignore — className is web-only
      className="menu-trigger"
      style={[styles.row, { backgroundColor: palette.surface }, style]}
    >
      {items.map((label, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={label + i}
            onPress={() => onSelect?.(i)}
            style={[
              styles.item,
              active ? { backgroundColor: palette.titlebarActive } : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                active ? { color: palette.titlebarActiveText } : { color: palette.ink },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: space.xs,
    paddingVertical: 2,
  },
  item: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  label: { ...type.ui },
});
