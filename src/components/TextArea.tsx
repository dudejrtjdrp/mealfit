import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

import { Text } from './Text';

export interface TextAreaProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** 멀티라인 입력 — 섹션 배경 + 우하단 "34 / 500" */
export function TextArea({ value, onChangeText, placeholder, maxLength = 500, minHeight = 168, style, accessibilityLabel }: TextAreaProps) {
  return (
    <View style={[styles.box, { minHeight }, style]}>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        multiline
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        textAlignVertical="top"
        style={[styles.input, { minHeight: minHeight - 60 }]}
      />
      <Text variant="small" color="ink3" style={styles.counter}>
        {value.length} / {maxLength}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.section, borderRadius: radius.lg, paddingHorizontal: 18, paddingTop: 18, paddingBottom: spacing.md },
  input: { ...type.body, color: colors.ink, padding: 0, outlineStyle: 'none' } as never,
  counter: { alignSelf: 'flex-end', marginTop: spacing.sm },
});
