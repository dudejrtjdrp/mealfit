import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

import { Card } from './Card';
import { Text } from './Text';

export interface InputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  /** 입력칸 왼쪽 아이콘 (Ionicons 이름) */
  icon?: keyof typeof Ionicons.glyphMap;
  /** 오른쪽 단위: 년 / cm / kg */
  unit?: string;
  placeholder?: string;
  /** 오류·안내 문구 (있으면 빨간 테두리 대신 아래 문구) */
  error?: string;
  /** number: 큰 숫자·숫자 키패드 (기본) / text: 일반 글자 */
  kind?: 'number' | 'text';
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  /** 카드로 감싸기 (기본 true). 시트 안에서는 false */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
  autoCapitalize?: 'none' | 'sentences';
}

/** B2 라벨 카드형 입력 — 카드 안 라벨 + 테두리 박스(아이콘·큰 숫자·단위) */
export function Input({
  label,
  value,
  onChangeText,
  icon,
  unit,
  placeholder,
  error,
  kind = 'number',
  keyboardType,
  maxLength,
  card = true,
  style,
  autoCapitalize = 'none',
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const isNum = kind === 'number';

  const body = (
    <>
      <Text variant="h3" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.box, focused && styles.boxFocused, !!error && styles.boxError]}>
        {icon ? <Ionicons name={icon} size={22} color={colors.ink2} style={styles.icon} /> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={(t) => onChangeText(isNum ? t.replace(/[^0-9.]/g, '') : t)}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          keyboardType={keyboardType ?? (isNum ? 'number-pad' : 'default')}
          inputMode={isNum ? 'numeric' : undefined}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, isNum ? styles.inputNum : styles.inputText]}
        />
        {unit ? (
          <Text variant="h3" color="ink2" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </>
  );

  return card ? (
    <Card padding={16} style={style}>
      {body}
    </Card>
  ) : (
    <View style={style}>{body}</View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md, marginLeft: 0 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  boxFocused: { borderColor: colors.primaryBorder },
  boxError: { borderColor: colors.danger },
  icon: { marginRight: spacing.lg },
  input: { flex: 1, width: 0, minWidth: 0, height: '100%', color: colors.ink, padding: 0, outlineStyle: 'none' } as never,
  inputNum: { ...type.numberSm, fontSize: 22 },
  inputText: { ...type.bodyMedium, fontSize: 16 },
  unit: { marginLeft: spacing.sm, fontFamily: type.body.fontFamily },
  error: { marginTop: spacing.sm, marginLeft: 2 },
});
