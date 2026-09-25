import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { canStepQty, qtyLabel, stepQty } from '@/domain/qty';
import { colors, fonts, radius, size as sizes, spacing } from '@/theme';

import { Text } from './Text';

export interface QtyStepperProps {
  value: number;
  onChange: (q: number) => void;
  /** 개·잔·인분… (domain/qty menuQtyUnit) */
  unit?: string;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

/** 수량 스테퍼 [− 1개 +] — 단위별 선택지(qtyOptionsFor: 조각은 1~6, 그 밖은 0.5~2 의 7단계) 사이를 한 칸씩. 끝에 닿으면 그쪽 버튼이 꺼진다 */
export function QtyStepper({ value, onChange, unit = '인분', size = 'md', style }: QtyStepperProps) {
  const h = size === 'lg' ? 52 : sizes.touch;
  const label = qtyLabel(value, unit);
  return (
    <View style={[styles.wrap, { height: h }, style]} accessibilityRole="adjustable" accessibilityLabel={`먹은 양 ${label}`} accessibilityValue={{ text: label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        if (canStepQty(value, dir, unit)) onChange(stepQty(value, dir, unit));
      }}
    >
      <StepButton dir={-1} value={value} unit={unit} onChange={onChange} h={h} />
      <Text style={[styles.value, size === 'lg' && styles.valueLg]} numberOfLines={1}>
        {label}
      </Text>
      <StepButton dir={1} value={value} unit={unit} onChange={onChange} h={h} />
    </View>
  );
}

function StepButton({ dir, value, unit, onChange, h }: { dir: 1 | -1; value: number; unit: string; onChange: (q: number) => void; h: number }) {
  const on = canStepQty(value, dir, unit);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir > 0 ? '더 많이' : '더 적게'}
      accessibilityState={{ disabled: !on }}
      disabled={!on}
      hitSlop={4}
      onPress={() => onChange(stepQty(value, dir, unit))}
      style={({ pressed }) => [styles.btn, { width: h, height: h }, pressed && styles.pressed]}
    >
      <Ionicons name={dir > 0 ? 'add' : 'remove'} size={22} color={on ? colors.ink : colors.disabledInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 2 },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { backgroundColor: colors.section },
  value: { minWidth: 64, textAlign: 'center', fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.ink, paddingHorizontal: spacing.xs },
  valueLg: { minWidth: 84, fontSize: 18, lineHeight: 24 },
});
