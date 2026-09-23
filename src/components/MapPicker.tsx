import { useEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';

import type { LatLng } from '@/domain/geo';
import { colors } from '@/theme';

export interface MapPickerProps {
  /** 핀 좌표 */
  coord: LatLng;
  /** 검색 반경(m) — 핀 둘레에 옅은 원으로 보여준다 */
  radiusM: number;
  /** 핀을 끌어 놓거나 지도를 탭했을 때 */
  onChange: (coord: LatLng) => void;
  style?: StyleProp<ViewStyle>;
}

/** 반경이 한눈에 들어오는 줌 (반경의 약 3배 폭) */
const regionFor = (c: LatLng, radiusM: number): Region => {
  const latDelta = (radiusM * 3) / 111_000;
  return { latitude: c.lat, longitude: c.lng, latitudeDelta: latDelta, longitudeDelta: latDelta / Math.cos((c.lat * Math.PI) / 180) };
};

const same = (a: LatLng | null, b: LatLng) => !!a && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

/**
 * 위치 설정 지도 (iOS: Apple 지도 — API 키 불필요).
 * 핀은 끌어서 옮기고, 지도를 탭해도 그 자리로 옮겨진다. 바깥에서 좌표가 바뀌면(내 위치로) 지도가 따라간다.
 * 웹은 MapPicker.web.tsx 폴백을 쓴다 (react-native-maps 는 웹 미지원).
 */
export function MapPicker({ coord, radiusM, onChange, style }: MapPickerProps) {
  const ref = useRef<MapView>(null);
  /** 사용자가 지도에서 직접 고른 마지막 좌표 — 이건 지도를 다시 옮기지 않는다 */
  const picked = useRef<LatLng | null>(null);

  useEffect(() => {
    if (same(picked.current, coord)) return;
    ref.current?.animateToRegion(regionFor(coord, radiusM), 350);
  }, [coord, radiusM]);

  const pick = (c: { latitude: number; longitude: number }) => {
    const next = { lat: c.latitude, lng: c.longitude };
    picked.current = next;
    onChange(next);
  };

  return (
    <MapView
      ref={ref}
      style={[styles.map, style]}
      initialRegion={regionFor(coord, radiusM)}
      onPress={(e) => pick(e.nativeEvent.coordinate)}
      showsUserLocation
      showsMyLocationButton={false}
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}
      accessibilityLabel="위치 설정 지도"
    >
      <Circle
        center={{ latitude: coord.lat, longitude: coord.lng }}
        radius={radiusM}
        strokeColor={colors.primary}
        strokeWidth={1}
        fillColor={`${colors.primary}14`}
      />
      <Marker
        draggable
        coordinate={{ latitude: coord.lat, longitude: coord.lng }}
        pinColor={colors.primary}
        onDragEnd={(e) => pick(e.nativeEvent.coordinate)}
        accessibilityLabel="기준 위치 핀"
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
