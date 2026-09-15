/**
 * 디자인 토큰 — 2026-09-15 확정 시안 10장에서 추출. 화면 코드는 색·간격·글꼴을 여기서만 가져온다.
 */
export const colors = {
  // 바탕
  bg: '#F4F6FA', // 페이지 (아주 연한 블루그레이)
  surface: '#FFFFFF', // 카드
  surfaceAlt: '#F7F9FB', // 카드 안의 서브 영역 (B6 리스트 등)
  line: '#E6EAF0',
  lineSoft: '#F0F2F5',

  // 글자
  ink: '#1E2430',
  ink2: '#5C6675',
  ink3: '#9AA3AF',
  inkOnPrimary: '#FFFFFF',

  // 브랜드 그린
  primary: '#3DAE85', // 주 버튼(다음·시작하기)
  primaryDark: '#2F9C75', // "이걸로 기록" 등 강조 CTA
  primaryText: '#2E8B6A', // 초록 글자
  primarySoft: '#E4F5EC', // 선택 칩·배지 바탕
  primarySofter: '#EEF8F3', // 연한 배너 배경
  primaryBorder: '#9DDBBF',

  // 판정 (시안 기준: 좋음 초록 · 괜찮음 호박 · 오늘은 패스 빨강)
  good: '#2E8B57',
  goodBg: '#E3F5EA',
  ok: '#C48A1A',
  okBg: '#FCF0D8',
  pass: '#E04848',
  passBg: '#FDE8E8',

  // 신뢰·커버리지
  coverFull: '#2E8B57',
  coverFullBg: '#E3F5EA',
  coverPartial: '#C48A1A',
  coverPartialBg: '#FCF0D8',
  coverNone: '#6B7684',
  coverNoneBg: '#EEF0F3',

  // 영양소
  kcal: '#F58A3A',
  kcalBg: '#FEF0E6',
  carbs: '#F5A146',
  carbsBg: '#FEF3E6',
  protein: '#F06A6A',
  proteinBg: '#FDEBEB',
  fat: '#4D8DF5',
  fatBg: '#E8F0FE',
  sugar: '#D96BB0',
  sugarBg: '#FBE9F4',
  sodium: '#7A8AA6',
  sodiumBg: '#EDF0F5',

  // 소셜
  kakao: '#FEE500',
  kakaoInk: '#191919',
  apple: '#000000',

  // 기타
  gaugeTrack: '#E9EDF2',
  gaugeFill: '#6FCF97',
  dot: '#3DAE85',
  danger: '#E04848',
  shadow: 'rgba(30, 36, 48, 0.06)',
} as const;

/**
 * 브랜드 타일(D1·D3) 색 — 사진 대신 쓰는 이니셜 타일. fg 글자색 · bg 연한 바탕.
 * 로고를 흉내 내지 않고 브랜드 계열색만 연하게 쓴다.
 */
export const brandColors: Record<string, { fg: string; bg: string }> = {
  gs25: { fg: '#1C8FD8', bg: '#E3F2FC' },
  cu: { fg: '#7A3FA0', bg: '#F1E8F7' },
  seven_eleven: { fg: '#E8702A', bg: '#FDEEE3' },
  starbucks: { fg: '#1E7A50', bg: '#E1F2E9' },
  mega: { fg: '#B8860B', bg: '#FBF3D9' },
  ediya: { fg: '#2B4C8C', bg: '#E6ECF7' },
  compose: { fg: '#C49A1A', bg: '#FBF3D9' },
  subway: { fg: '#2E8B3E', bg: '#FFF6CC' },
  salady: { fg: '#4E9A3A', bg: '#EAF5E3' },
  paris_baguette: { fg: '#1F4E9A', bg: '#E6EDF8' },
  bonjuk: { fg: '#A0522D', bg: '#F7ECE3' },
  mom_touch: { fg: '#D9442F', bg: '#FCE9E6' },
  _default: { fg: '#5C6675', bg: '#EEF0F3' },
};

/** 메뉴 카테고리 타일 바탕 */
export const menuTileColors = {
  drink: '#F5EDE4',
  meal: '#FEF3E6',
  snack: '#FBEFE9',
  salad: '#E8F5EC',
  side: '#EDF0F5',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  /** 화면 좌우 여백 */
  page: 20,
} as const;

export const radius = {
  sm: 10,
  md: 14, // 입력창·작은 카드
  lg: 20, // 카드
  xl: 24, // 큰 카드·시트
  pill: 999,
} as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

/** 타입 스케일 (fontSize / lineHeight) */
export const type = {
  display: { fontSize: 32, lineHeight: 42, fontFamily: fonts.bold }, // 온보딩 제목
  h1: { fontSize: 26, lineHeight: 34, fontFamily: fonts.bold }, // 탭 타이틀 "기록"
  h2: { fontSize: 20, lineHeight: 28, fontFamily: fonts.bold }, // 카드 제목
  h3: { fontSize: 17, lineHeight: 24, fontFamily: fonts.semibold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontFamily: fonts.medium },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  captionMedium: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  label: { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold },
  number: { fontSize: 40, lineHeight: 46, fontFamily: fonts.bold }, // 842
  numberSm: { fontSize: 24, lineHeight: 30, fontFamily: fonts.bold },
} as const;

export const shadow = {
  card: {
    shadowColor: '#1E2430',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#1E2430',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const hit = { top: 8, bottom: 8, left: 8, right: 8 };

export const theme = { colors, spacing, radius, fonts, type, shadow };
export type Theme = typeof theme;
