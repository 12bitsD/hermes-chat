import React, { forwardRef } from 'react';
import { TextInput, View, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { palette, type, bevel, space } from '../../theme';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  multiline?: boolean;
  containerStyle?: ViewStyle;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(({ label, multiline, containerStyle, style, ...rest }, ref) => {
  return (
    <View style={[styles.outer, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, bevel.inset]}>
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor={palette.inkMuted}
          {...rest}
          style={[
            styles.input,
            multiline ? styles.inputMultiline : null,
            style,
          ]}
        />
      </View>
    </View>
  );
});

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  outer: { marginVertical: space.xs },
  label: { ...type.ui, color: palette.ink, marginBottom: 2 },
  box: { backgroundColor: palette.paper, paddingHorizontal: 2, paddingVertical: 0 },
  input: {
    ...type.body,
    color: palette.ink,
    backgroundColor: palette.paper,
    padding: 0,
    minHeight: 22,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingVertical: 4,
  },
});
