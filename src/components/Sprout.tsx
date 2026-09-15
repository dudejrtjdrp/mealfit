import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** 워드마크 새싹 아이콘 (A2) — 줄기 + 두 잎 */
export function Sprout({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel="새싹">
      <Path d="M19 38 C19 30 19.5 24 22 17" stroke={colors.primary} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <Path d="M21.5 18 C22 9 28 3 38 2 C38 11 32 18 21.5 18 Z" fill={colors.primary} />
      <Path d="M19.5 24 C18 17 11 13 2 15 C4 22 11 26 19.5 24 Z" fill={colors.gaugeFill} />
    </Svg>
  );
}
