import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { neutral, type, space, radius } from '../../theme';

export interface MenuBarProps {
  items: string[];
  activeIndex?: number;
  onSelect?: (i: number) => void;
  style?: ViewStyle;
}

/**
 * MenuBar — flat row of text items, subtle hover. Used for the right-side
 * prompt navigator's category filter, etc.
 */
export const MenuBar: React.FC<MenuBarProps> = ({ items, activeIndex, onSelect, style }) => {
  return (
    <View
      // @ts-ignore — className is web-only
      className="menu-trigger"
      style={[styles.row, style]}
    >
      {items.map((label, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={label + i}
            onPress={() => onSelect?.(i)}
            style={[
              styles.item,
              active ? styles.itemActive : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : null,
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
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  itemActive: {
    backgroundColor: neutral.surfaceMuted,
  },
  label: { ...type.caption, color: neutral.inkSoft },
  labelActive: { color: neutral.ink, fontWeight: '600' },
});
