import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing, type } from '@/theme';

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

/** B5 흰 카드 멀티라인 입력 + 우하단 "34 / 500" */
export function TextArea({ value, onChangeText, placeholder, maxLength = 500, minHeight = 168, style, accessibilityLabel }: TextAreaProps) {
  return (
    <View style={[styles.card, { minHeight }, style]}>
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
      <Text variant="caption" color="ink3" style={styles.counter}>
        {value.length} / {maxLength}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 20, paddingTop: 22, paddingBottom: spacing.lg, ...shadow.card },
  input: { ...type.body, lineHeight: 22, color: colors.ink, padding: 0, outlineStyle: 'none' } as never,
  counter: { alignSelf: 'flex-end', marginTop: spacing.sm },
});
