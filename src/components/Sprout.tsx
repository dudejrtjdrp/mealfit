import { colors } from '@/theme';

import { SproutIcon } from './icons';

/** 새싹 스트로크 아이콘 (로고 자리 플레이스홀더) */
export function Sprout({ size = 40, color = colors.primaryText }: { size?: number; color?: string }) {
  return <SproutIcon size={size} color={color} />;
}
