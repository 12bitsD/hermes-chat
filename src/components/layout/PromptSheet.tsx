import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Modal, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, space, radius } from '../../theme';
import { PromptNavigator } from '../prompt-nav/PromptNavigator';

export interface PromptSheetProps {
  open: boolean;
  onClose: () => void;
  onInsertPrompt: (body: string) => void;
}

export const PromptSheet: React.FC<PromptSheetProps> = ({ open, onClose, onInsertPrompt }) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: open ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [open, slideAnim]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetPanel,
          { transform: [{ translateY }], paddingBottom: insets.bottom + 8, paddingTop: 8 },
        ]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>
        <PromptNavigator onInsertPrompt={(body) => { onInsertPrompt(body); onClose(); }} embedded />
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  drawerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  sheetPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 540, maxHeight: '80%',
    backgroundColor: neutral.surface, borderTopWidth: 1, borderTopColor: neutral.border, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  sheetHandleWrap: { alignItems: 'center', paddingBottom: space.xs },
  sheetHandle: { width: 40, height: 4, backgroundColor: neutral.border, borderRadius: 2 },
});
