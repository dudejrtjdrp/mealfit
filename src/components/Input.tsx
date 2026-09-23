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
  /** 안내 문구 (범위 밖 값 등) — 빨강 대신 호박색 테두리 + 아래 문구 */
  error?: string;
  /** number: 큰 숫자·숫자 키패드 (기본) / text: 일반 글자 */
  kind?: 'number' | 'text';
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  /** 카드로 감싸기 (기본 false) */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
  autoCapitalize?: 'none' | 'sentences';
  /** 비밀번호 입력 */
  secureTextEntry?: boolean;
}

/** 라벨 + 회색 바탕 입력칸(아이콘·값·단위). 포커스 시 그린 테두리 */
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
  card = false,
  style,
  autoCapitalize = 'none',
  secureTextEntry,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const isNum = kind === 'number';

  const body = (
    <>
      <Text variant="captionMedium" color="ink2" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.box, focused && styles.boxFocused, !!error && styles.boxError]}>
        {icon ? <Ionicons name={icon} size={20} color={colors.ink3} style={styles.icon} /> : null}
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
          secureTextEntry={secureTextEntry}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, isNum ? styles.inputNum : styles.inputText]}
        />
        {unit ? (
          <Text variant="body" color="ink3" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" color="notice" style={styles.error}>
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
  label: { marginBottom: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.section,
    backgroundColor: colors.section,
    paddingHorizontal: spacing.lg,
  },
  boxFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  boxError: { borderColor: colors.notice },
  icon: { marginRight: spacing.md },
  input: { flex: 1, width: 0, minWidth: 0, height: '100%', color: colors.ink, padding: 0, outlineStyle: 'none' } as never,
  inputNum: { ...type.numberSm, fontSize: 18 },
  inputText: { ...type.bodyMedium, fontSize: 16 },
  unit: { marginLeft: spacing.sm },
  error: { marginTop: spacing.xs + 2, marginLeft: 2 },
});
