import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { LatLng } from '@/domain/geo';
import { colors, fonts } from '@/theme';

import { PinIcon } from './icons';
import { Text } from './Text';

/**
 * react-native-maps 는 네이티브 모듈이라, 모듈이 빠진 빌드(구 바이너리·팟 미설치)에서
 * 최상위 import 를 하면 앱 시작 시점에 throw 되어 스플래시에서 멈춘다 (2026-09-23 TestFlight 사고).
 * 반드시 지연 require + 실패 시 폴백으로 감싼다.
 */
let maps: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  maps = require('react-native-maps');
} catch {
  maps = null;
}

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
const regionFor = (c: LatLng, radiusM: number) => {
  const latDelta = (radiusM * 3) / 111_000;
  return { latitude: c.lat, longitude: c.lng, latitudeDelta: latDelta, longitudeDelta: latDelta / Math.cos((c.lat * Math.PI) / 180) };
};

const same = (a: LatLng | null, b: LatLng) => !!a && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

/**
 * 위치 설정 지도 (iOS: Apple 지도 — API 키 불필요).
 * 핀은 끌어서 옮기고, 지도를 탭해도 그 자리로 옮겨진다. 바깥에서 좌표가 바뀌면(내 위치로) 지도가 따라간다.
 * 웹은 MapPicker.web.tsx 폴백을 쓰고, 지도 모듈이 없는 빌드에서는 좌표 폴백을 그린다.
 */
export function MapPicker({ coord, radiusM, onChange, style }: MapPickerProps) {
  const ref = useRef<any>(null);
  /** 사용자가 지도에서 직접 고른 마지막 좌표 — 이건 지도를 다시 옮기지 않는다 */
  const picked = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!maps) return;
    if (same(picked.current, coord)) return;
    ref.current?.animateToRegion(regionFor(coord, radiusM), 350);
  }, [coord, radiusM]);

  if (!maps) {
    return (
      <View style={[styles.fallback, style]} accessibilityLabel="지도를 불러올 수 없어요">
        <PinIcon size={28} color={colors.primaryText} />
        <Text style={styles.fallbackTitle}>지도를 불러올 수 없어요</Text>
        <Text style={styles.fallbackBody}>
          현재 기준: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)} · 반경 {radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`}
        </Text>
        <Text style={styles.fallbackBody}>"내 위치로"와 "이 위치로 설정"은 그대로 쓸 수 있어요.</Text>
      </View>
    );
  }

  const MapView = maps.default;
  const { Circle, Marker } = maps;

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
      onPress={(e: any) => pick(e.nativeEvent.coordinate)}
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
        onDragEnd={(e: any) => pick(e.nativeEvent.coordinate)}
        accessibilityLabel="기준 위치 핀"
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.section, padding: 20 },
  fallbackTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  fallbackBody: { fontSize: 13, color: colors.ink3, textAlign: 'center' },
});
