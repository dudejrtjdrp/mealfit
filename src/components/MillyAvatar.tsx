import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

import { SproutIcon } from './icons';

export type MillyPose = 'base' | 'thinking' | 'cheer' | 'sorry' | 'sleep';

/**
 * 캐릭터 이미지 정적 맵.
 * 그래픽(ChatGPT 제작 예정)이 assets/character/milly-<pose>.png 로 들어오면 아래 require 줄의 주석만 풀면 된다.
 * RN 의 require 는 정적이어야 해서, 파일이 없는 지금 require 를 켜면 번들이 깨진다 — 파일을 넣은 뒤에 켤 것.
 * 한 포즈만 먼저 들어와도 된다: 없는 포즈는 아래 플레이스홀더(틴트 원 + 새싹)로 그린다.
 */
const MILLY_IMAGES: Partial<Record<MillyPose, ImageSourcePropType>> = {
  base: require('@/assets/character/milly-base.png'),
  thinking: require('@/assets/character/milly-thinking.png'),
  cheer: require('@/assets/character/milly-cheer.png'),
  sorry: require('@/assets/character/milly-sorry.png'),
  sleep: require('@/assets/character/milly-sleep.png'),
};

export interface MillyAvatarProps {
  pose?: MillyPose;
  /** 지름 (기본 40 — 채팅 아바타) */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** 밀리 캐릭터 — 이미지가 없으면 틴트 원 + 그린 새싹 스트로크 플레이스홀더 */
export function MillyAvatar({ pose = 'base', size = 40, style }: MillyAvatarProps) {
  const image = MILLY_IMAGES[pose];
  const box = { width: size, height: size, borderRadius: size / 2 };

  // thinking: 은은하게 숨쉬기
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pose !== 'thinking') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pose, pulse]);

  if (image) {
    return <Image accessibilityLabel="밀리" source={image} style={[box, style as never]} resizeMode="contain" />;
  }

  const muted = pose === 'sleep' || pose === 'sorry';
  const iconSize = Math.round(size * 0.55);
  return (
    <View accessibilityLabel="밀리 캐릭터 자리" style={[styles.circle, box, { backgroundColor: muted ? colors.line : colors.primaryTint }, style]}>
      <Animated.View style={{ opacity: pose === 'thinking' ? pulse : 1 }}>
        <SproutIcon size={iconSize} color={muted ? colors.ink3 : colors.primaryText} />
      </Animated.View>
      {pose === 'cheer' ? <PoseMark size={size} kind="cheer" /> : null}
      {pose === 'sleep' ? <PoseMark size={size} kind="sleep" /> : null}
      {pose === 'thinking' ? <PoseMark size={size} kind="thinking" /> : null}
    </View>
  );
}

/** 포즈 구분용 작은 표시 (플레이스홀더 전용) */
function PoseMark({ size, kind }: { size: number; kind: 'cheer' | 'sleep' | 'thinking' }) {
  const s = Math.round(size * 0.36);
  const stroke = kind === 'cheer' ? colors.primary : colors.ink3;
  return (
    <View pointerEvents="none" style={[styles.mark, { width: s, height: s, top: -s * 0.15, right: -s * 0.15 }]}>
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {kind === 'cheer' ? <Path d="M12 3v5M4.5 8.5l3.5 2.5M19.5 8.5L16 11" /> : null}
        {kind === 'sleep' ? <Path d="M8 6h8l-8 10h8" /> : null}
        {kind === 'thinking' ? (
          <>
            <Circle cx={6} cy={16} r={1.6} fill={stroke} />
            <Circle cx={12} cy={16} r={1.6} fill={stroke} />
            <Circle cx={18} cy={16} r={1.6} fill={stroke} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
});
