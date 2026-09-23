import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * 시안(mealing A안)의 1.8px 스트로크 아이콘 세트 — 24×24 뷰박스, 색은 currentColor 대신 color prop.
 * 이모지를 아이콘으로 쓰지 않는다. 필요한 아이콘은 여기에 SVG 로 추가하거나 @expo/vector-icons 를 쓴다.
 */
export type IconProps = { size?: number; color?: string; strokeWidth?: number };

function Base({ size = 24, color = colors.ink2, strokeWidth = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

/** 그릇 (오늘 탭 · 기록 행) */
export function BowlIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M3 11.5h18" />
      <Path d="M4 11.5a8 8 0 0 0 16 0" />
      <Path d="M9 20.5h6" />
      <Path d="M9.5 8c0-1.2.8-1.6.8-2.8M13.5 8c0-1.2.8-1.6.8-2.8" />
    </Base>
  );
}

/** 위치 핀 (주변 탭) */
export function PinIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.5} />
    </Base>
  );
}

/** 달력 (기록 탭) */
export function CalendarIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </Base>
  );
}

/** 사람 (마이 탭) */
export function PersonIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20.5c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </Base>
  );
}

/** 알림 종 */
export function BellIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5z" />
      <Path d="M10.2 20.5a2 2 0 0 0 3.6 0" />
    </Base>
  );
}

/** 뒤로 */
export function BackIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M15 5l-7 7 7 7" />
    </Base>
  );
}

/** 아래 화살표 (정렬) */
export function ChevronDownIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M7 10l5 5 5-5" />
    </Base>
  );
}

/** 오른쪽 화살표 */
export function ChevronRightIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M9 5l7 7-7 7" />
    </Base>
  );
}

/** 컵 (음료 메뉴) */
export function CupIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M5 7.5h14" />
      <Path d="M6.5 7.5l1.3 11.7A2 2 0 0 0 9.8 21h4.4a2 2 0 0 0 2-1.8l1.3-11.7" />
      <Path d="M8 7.5L8.8 4.5h6.4l.8 3" />
      <Path d="M13 4.5l1-2.5" />
    </Base>
  );
}

/** 공식 영양표 (문서 + 체크) — 신뢰등급 배지 */
export function FileCheckIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3v5h5" />
      <Path d="M9 14.5l2 2 4-4" />
    </Base>
  );
}

/** 보내기 (채팅 입력바) */
export function SendIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 19V5" />
      <Path d="M6 11l6-6 6 6" />
    </Base>
  );
}

/** 새싹 — 밀리 플레이스홀더 · 워드마크 로고 자리 */
export function SproutIcon(p: IconProps) {
  return (
    <Base {...p}>
      <Path d="M12 20v-8" />
      <Path d="M12 12c0-4-3-6.5-7.5-6.5 0 4 3 6.5 7.5 6.5z" />
      <Path d="M12 14.5c0-3.5 2.6-6 6.5-6 0 3.5-2.6 6-6.5 6z" />
    </Base>
  );
}
