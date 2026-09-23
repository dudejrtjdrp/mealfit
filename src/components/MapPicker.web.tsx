import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { PinIcon } from './icons';
import { Text } from './Text';
import type { MapPickerProps } from './MapPicker';

export type { MapPickerProps } from './MapPicker';

/**
 * 웹 폴백 — react-native-maps 는 웹을 지원하지 않아 지도 대신 좌표만 보여준다.
 * 위치 바꾸기는 화면의 "내 위치로" 버튼으로만 한다.
 */
export function MapPicker({ coord, radiusM, style }: MapPickerProps) {
  return (
    <View style={[styles.root, style]} accessibilityLabel="위치 설정 지도 (웹 미리보기)">
      <View style={styles.pin}>
        <PinIcon size={28} color={colors.primary} />
      </View>
      <Text variant="h3" align="center">
        {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
      </Text>
      <Text variant="caption" color="ink3" align="center">
        반경 {radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`} · 웹 미리보기에서는 지도를 보여드리지 않아요
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.section, padding: spacing.page },
  pin: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
