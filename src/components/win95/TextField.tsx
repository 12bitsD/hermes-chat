import { forwardRef } from 'react';
import { TextInput, View, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { neutral, type, space } from '../../theme';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  multiline?: boolean;
  containerStyle?: ViewStyle;
  bare?: boolean; // skip the 1px line; for use on already-tinted backgrounds
}

/**
 * Flat text field. A single 1px line beneath the input (or a soft filled box
 * on a `bare` surface). No inset bevel, no raised chrome.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(({
  label, multiline, containerStyle, style, bare = false, ...rest
}, ref) => {
  return (
    <View style={[styles.outer, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, bare ? styles.boxBare : styles.boxLine]}>
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor={neutral.inkMuted}
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
  label: { ...type.caption, color: neutral.inkMuted, marginBottom: 4 },
  box: { backgroundColor: 'transparent' },
  boxLine: {
    borderBottomWidth: 1,
    borderBottomColor: neutral.border,
    paddingBottom: 4,
  },
  boxBare: {},
  input: {
    ...type.body,
    color: neutral.ink,
    backgroundColor: 'transparent',
    padding: 0,
    minHeight: 22,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingVertical: 4,
  },
});
