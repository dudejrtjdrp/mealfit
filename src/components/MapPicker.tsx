import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
  /** 핀 좌표 (= 지도 한가운데) */
  coord: LatLng;
  /** 검색 반경(m) — 핀 둘레에 옅은 원으로 보여준다 */
  radiusM: number;
  /** 지도를 움직여 멈췄거나 지도를 탭했을 때 — 멈춘 지도 한가운데 좌표 */
  onChange: (coord: LatLng) => void;
  style?: StyleProp<ViewStyle>;
}

/** 반경이 한눈에 들어오는 줌 (반경의 약 3배 폭) */
const regionFor = (c: LatLng, radiusM: number) => {
  const latDelta = (radiusM * 3) / 111_000;
  return { latitude: c.lat, longitude: c.lng, latitudeDelta: latDelta, longitudeDelta: latDelta / Math.cos((c.lat * Math.PI) / 180) };
};

/** 약 1m 이내면 같은 자리로 본다 — 프로그램이 옮긴 지도가 멈출 때 생기는 미세 오차를 흡수 */
const same = (a: LatLng | null, b: LatLng) => !!a && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;

const toLatLng = (c: { latitude: number; longitude: number }): LatLng => ({ lat: c.latitude, lng: c.longitude });

/**
 * 위치 설정 지도 (iOS: Apple 지도 — API 키 불필요).
 * 핀은 지도 한가운데에 고정돼 있고, 지도를 끌어 옮기면 핀이 그대로 따라온다(배달앱 방식).
 * 지도를 탭하면 그 자리로 지도가 이동한다. 바깥에서 좌표가 바뀌면(내 위치로) 지도가 따라간다.
 * 웹은 MapPicker.web.tsx 폴백을 쓰고, 지도 모듈이 없는 빌드에서는 좌표 폴백을 그린다.
 */
export function MapPicker({ coord, radiusM, onChange, style }: MapPickerProps) {
  const ref = useRef<any>(null);
  /** 사용자가 지도에서 직접 고른 마지막 좌표 — 이건 지도를 다시 옮기지 않는다 */
  const picked = useRef<LatLng | null>(null);
  /** 움직이는 동안의 지도 중심 — 반경 원이 실시간으로 따라오게 */
  const [live, setLive] = useState<LatLng>(coord);
  /** 움직이는 동안 핀을 살짝 들어 올린다 */
  const lift = useRef(new Animated.Value(0)).current;
  const moving = useRef(false);

  useEffect(() => {
    if (!maps) return;
    if (same(picked.current, coord)) return;
    setLive(coord);
    ref.current?.animateToRegion(regionFor(coord, radiusM), 350);
  }, [coord, radiusM]);

  const setMoving = (m: boolean) => {
    if (moving.current === m) return;
    moving.current = m;
    Animated.spring(lift, { toValue: m ? 1 : 0, useNativeDriver: true, speed: 30, bounciness: m ? 0 : 8 }).start();
  };

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
  const { Circle } = maps;

  const onRegionChange = (r: { latitude: number; longitude: number }) => {
    setMoving(true);
    setLive(toLatLng(r));
  };

  const onRegionChangeComplete = (r: { latitude: number; longitude: number }) => {
    setMoving(false);
    const next = toLatLng(r);
    setLive(next);
    // 처음 뜰 때나 "내 위치로"로 옮긴 경우처럼 이미 그 좌표면 선택으로 치지 않는다
    if (same(coord, next)) return;
    picked.current = next;
    onChange(next);
  };

  /** 탭한 자리로 지도(=핀)를 옮긴다 — 줌은 그대로 */
  const onPress = (e: any) => {
    const c = e.nativeEvent.coordinate;
    ref.current?.animateCamera({ center: c }, { duration: 250 });
  };

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <View style={[styles.map, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(coord, radiusM)}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onPress}
        showsUserLocation
        showsMyLocationButton={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        accessibilityLabel="위치 설정 지도"
      >
        <Circle
          center={{ latitude: live.lat, longitude: live.lng }}
          radius={radiusM}
          strokeColor={colors.primary}
          strokeWidth={1}
          fillColor={`${colors.primary}14`}
        />
      </MapView>

      {/* 지도 한가운데 고정 핀 — 핀 끝이 정확히 중심을 가리킨다 */}
      <View pointerEvents="none" style={styles.center} accessibilityLabel="기준 위치 핀">
        <Animated.View style={[styles.groundDot, { transform: [{ scale: shadowScale }] }]} />
        <Animated.View style={[styles.pin, { transform: [{ translateY }] }]}>
          <View style={styles.pinHead}>
            <View style={styles.pinDot} />
          </View>
          <View style={styles.pinStem} />
        </Animated.View>
      </View>
    </View>
  );
}

const PIN_HEAD = 30;
const PIN_STEM = 14;

const styles = StyleSheet.create({
  map: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  /** 핀 끝(아래쪽)이 중심에 오도록 핀 전체 높이만큼 위로 올린다 */
  pin: { position: 'absolute', top: '50%', marginTop: -(PIN_HEAD + PIN_STEM), alignItems: 'center' },
  pinHead: {
    width: PIN_HEAD,
    height: PIN_HEAD,
    borderRadius: PIN_HEAD / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  pinStem: { width: 3, height: PIN_STEM, marginTop: -1, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.primary },
  groundDot: { position: 'absolute', top: '50%', marginTop: -3, width: 10, height: 6, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.25)' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.section, padding: 20 },
  fallbackTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  fallbackBody: { fontSize: 13, color: colors.ink3, textAlign: 'center' },
});
