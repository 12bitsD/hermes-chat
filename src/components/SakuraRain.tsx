import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { isNative } from '../utils/platform';

/**
 * Ambient sakura petal rain. Renders a full-screen layer of soft falling
 * petals. Low opacity so it never competes with the chat content above it.
 * Petals are tiny unicode sakura characters animated on random Y trajectories
 * via Animated.Value — cheap, no external assets, gracefully degrades on web.
 *
 * The layer sits at pointerEvents="none" so it never blocks taps.
 */
export const SakuraRain: React.FC<{ count?: number; opacity?: number }> = ({
  count = isNative ? 10 : 6,
  opacity = 0.35,
}) => {
  const { width, height } = Dimensions.get('window');
  const petals = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random() * width,
      delay: Math.random() * 6000,
      duration: 6000 + Math.random() * 8000,
      size: 14 + Math.random() * 10,
      sway: 30 + Math.random() * 60,
      start: -20,
      end: height + 20,
    })),
  ).current;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {petals.map((p, i) => (
        <Petal key={i} {...p} opacity={opacity} />
      ))}
    </View>
  );
};

const Petal: React.FC<{
  x: number; delay: number; duration: number; size: number; sway: number; start: number; end: number; opacity: number;
}> = ({ x, delay, duration, size, sway, start, end, opacity }) => {
  const y = useRef(new Animated.Value(start)).current;
  const xOff = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: end, duration, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    const swayAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(xOff, { toValue: sway, duration: duration / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(xOff, { toValue: -sway, duration: duration / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(xOff, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const spinAnim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }),
    );
    drop.start();
    swayAnim.start();
    spinAnim.start();
    return () => { drop.stop(); swayAnim.stop(); spinAnim.stop(); };
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.Text
      style={[
        styles.petal,
        {
          left: x,
          fontSize: size,
          opacity,
          transform: [
            { translateY: y },
            { translateX: xOff },
            { rotate },
          ],
        },
      ]}
    >
      🌸
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  petal: {
    position: 'absolute',
    top: 0,
    color: '#F8BBD0',
  },
});
