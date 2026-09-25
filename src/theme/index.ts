/**
 * mealing 디자인 토큰 — 2026-09 리디자인 확정 시안(프레시 그린 A안) 기준.
 * 규율: 흰 바탕 + 무채색 UI + 포인트 그린 1색(CTA·선택·강조·게이지). 그림자 대신 헤어라인·배경색 차이로 구획.
 * 화면 코드는 색·간격·글꼴·radius 를 여기서만 가져온다 (하드코딩 금지).
 */
export const colors = {
  // 바탕·구획
  bg: '#FFFFFF', // 페이지 바탕
  surface: '#FFFFFF', // 카드
  section: '#F7F8FA', // 섹션 배경 · 밀리 말풍선 · 입력칸 바탕
  line: '#F2F4F6', // 헤어라인 (카드 테두리·구분선) · 게이지 트랙 · 아이콘 원
  border: '#D7DCE2', // 컨트롤 테두리 (칩·아웃라인 배지·버튼)

  // 글자
  ink: '#191F28', // 제목 · 사용자 말풍선 바탕
  ink2: '#4E5968', // 본문
  ink3: '#8B95A1', // 보조
  inkOnPrimary: '#FFFFFF',

  // 포인트 그린 (단일 포인트)
  primary: '#17A05E', // 채움 (CTA·게이지·선택 칩)
  primaryText: '#0E8A4D', // 흰 바탕 위 강조 글자
  primaryTint: '#E6F6EE', // 틴트 바탕 (선택 칩·여유 미니카드·밀리 아바타)

  // 판정 배지 — 빨강은 쓰지 않는다(빨강은 아래 '목표 초과량' 전용). fg / bg
  good: '#158A4C',
  goodBg: '#E8F7EE',
  ok: '#B45309',
  okBg: '#FEF3DC',
  pass: '#6B7280',
  passBg: '#F1F2F4',

  /** 입력 안내(범위 밖 값 등) — 빨강 대신 호박색 */
  notice: '#B45309',

  /**
   * 하루 목표를 넘은 양 — 2026-09-25 효님 결정으로 숨기지 않고 빨강으로 보여준다.
   * 목표 초과량 수치·링/바의 넘은 부분에만 쓴다(판정 배지·버튼·경고에는 쓰지 않는다).
   * 흰 바탕 대비 5.2:1, overBg 대비 4.8:1 (WCAG AA 텍스트)
   */
  over: '#D12A1D',
  overBg: '#FEF3F2',

  // 비활성
  disabledBg: '#F2F4F6',
  disabledInk: '#B0B8C1',

  // 소셜 로그인 (브랜드 가이드 색)
  kakao: '#FEE500',
  kakaoInk: '#191919',
  apple: '#000000',

  overlay: 'rgba(25, 31, 40, 0.4)',

} as const;

export type ColorKey = keyof typeof colors;

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
  xs: 8,
  /** 버튼·입력칸 */
  button: 12,
  /** 여유분 미니카드 */
  md: 14,
  /** 리스트 카드(메뉴·매장) */
  lg: 16,
  /** 큰 카드 (게이지·기록) */
  card: 20,
  /** 바텀시트 */
  sheet: 24,
  pill: 999,
} as const;

/** 컴포넌트 치수 */
export const size = {
  /** 풀폭 CTA 높이 */
  button: 54,
  /** 헤더 높이 */
  header: 56,
  /** 최소 터치 영역 */
  touch: 44,
} as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

/** 타입 스케일 (fontSize / lineHeight / letterSpacing) */
export const type = {
  display: { fontSize: 26, lineHeight: 36, fontFamily: fonts.bold, letterSpacing: -0.5 }, // 로그인 헤드라인
  h1: { fontSize: 22, lineHeight: 32, fontFamily: fonts.bold, letterSpacing: -0.4 }, // 인사 헤드라인 · 탭 타이틀
  h2: { fontSize: 17, lineHeight: 24, fontFamily: fonts.bold, letterSpacing: -0.3 }, // 헤더 제목 · 카드 큰 제목
  h3: { fontSize: 15, lineHeight: 22, fontFamily: fonts.bold, letterSpacing: -0.2 }, // 섹션 제목 · 메뉴 이름
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontFamily: fonts.medium },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  captionMedium: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  small: { fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  label: { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold },
  button: { fontSize: 17, lineHeight: 22, fontFamily: fonts.bold, letterSpacing: -0.2 },
  number: { fontSize: 30, lineHeight: 34, fontFamily: fonts.bold, letterSpacing: -0.6 }, // 링 가운데 540
  numberSm: { fontSize: 20, lineHeight: 26, fontFamily: fonts.bold, letterSpacing: -0.4 },
} as const;

/** 그림자는 최소화 — 떠 있는 요소(토스트)에만 */
export const shadow = {
  float: {
    shadowColor: '#191F28',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export const hit = { top: 8, bottom: 8, left: 8, right: 8 };

export const theme = { colors, spacing, radius, size, fonts, type, shadow };
export type Theme = typeof theme;
