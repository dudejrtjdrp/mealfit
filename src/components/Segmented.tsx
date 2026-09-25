import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** 스크린리더용 묶음 이름 (예: "정렬") */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 세그먼트 컨트롤 — 회색 트랙 위 칸 중 고른 칸만 흰 바탕 + 진한 글자.
 * 선택지가 전부 보이므로 "눌러야 바뀌는 ▼" 처럼 생김새와 동작이 어긋나지 않는다.
 */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, style }: SegmentedProps<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => (selected ? undefined : onChange(o.id))}
            style={({ pressed }) => [styles.cell, selected && styles.cellOn, pressed && !selected && styles.pressed]}
          >
            <Text variant="captionMedium" color={selected ? 'ink' : 'ink3'} style={selected ? styles.labelOn : undefined} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.section, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  cell: { height: 32, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  cellOn: { backgroundColor: colors.surface, borderColor: colors.border },
  labelOn: { fontFamily: fonts.semibold },
  pressed: { opacity: 0.6 },
});
