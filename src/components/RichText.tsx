import { fonts } from '@/theme';

import { Text, type TextProps } from './Text';

/**
 * 2색 헤드라인 — 검정 문장 속 **강조** 구간만 그린(#0E8A4D) Bold.
 * 예: <RichText variant="h1" text={'성효님, 오늘\n**540kcal** 더 먹을 수 있어요'} />
 */
export function RichText({ text, emphasisColor = 'primaryText', ...rest }: Omit<TextProps, 'children'> & { text: string; emphasisColor?: TextProps['color'] }) {
  const parts = text.split('**');
  return (
    <Text {...rest}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} variant={rest.variant} color={emphasisColor} style={{ fontFamily: fonts.bold }}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

/** 강조 구간(** **) 표시를 뺀 순수 문장 — 접근성 라벨·테스트용 */
export function plainText(text: string): string {
  return text.split('**').join('');
}
