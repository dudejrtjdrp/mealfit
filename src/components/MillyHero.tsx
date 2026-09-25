import { Image } from 'expo-image';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

import type { MillyPose } from './MillyAvatar';
import { Text } from './Text';

const POSE_IMAGE: Record<MillyPose, number> = {
  base: require('@/assets/character/milly-base.png'),
  thinking: require('@/assets/character/milly-thinking.png'),
  cheer: require('@/assets/character/milly-cheer.png'),
  sorry: require('@/assets/character/milly-sorry.png'),
  sleep: require('@/assets/character/milly-sleep.png'),
};

export interface MillyHeroProps {
  pose: MillyPose;
  /** 큰 제목 ("오늘은 이렇게 어때요?") */
  title: string;
  /** 제목 아래 한두 줄 (Text 또는 문자열) */
  sub?: ReactNode;
  /** 제목 아래 버튼 등 */
  children?: ReactNode;
  /** 캐릭터 크기 (기본 156) */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * 밀리 탭 상단 — 말풍선 없이 큰 밀리 캐릭터 + 큰 제목 한 줄.
 * 캐릭터 뒤에는 연한 그린 원을 깔고, thinking 포즈일 땐 살짝 둥실거린다.
 */
export function MillyHero({ pose, title, sub, children, size = 156, style }: MillyHeroProps) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pose !== 'thinking') {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -5, duration: 700, useNativeDriver: false }),
        Animated.timing(bob, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pose, bob]);

  const blob = Math.round(size * 0.92);
  const muted = pose === 'sleep' || pose === 'sorry';
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.text}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {typeof sub === 'string' ? (
          <Text variant="caption" color="ink2" style={styles.sub}>
            {sub}
          </Text>
        ) : sub ? (
          <View style={styles.sub}>{sub}</View>
        ) : null}
        {children ? <View style={styles.children}>{children}</View> : null}
      </View>
      <View style={{ width: size, height: size }} accessibilityLabel="밀리">
        <View
          style={[
            styles.blob,
            { width: blob, height: blob, borderRadius: blob / 2, left: (size - blob) / 2, top: (size - blob) / 2 + size * 0.06, backgroundColor: muted ? colors.section : colors.primaryTint },
          ]}
        />
        <Animated.View style={{ transform: [{ translateY: bob }] }}>
          <Image source={POSE_IMAGE[pose]} style={{ width: size, height: size }} contentFit="contain" transition={150} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0 },
  sub: { marginTop: spacing.sm },
  children: { marginTop: spacing.md, alignItems: 'flex-start' },
  blob: { position: 'absolute' },
});
