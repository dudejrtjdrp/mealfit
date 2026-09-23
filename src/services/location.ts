import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LatLng } from '@/domain/geo';

import { env } from './env';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

const toStatus = (s: string | undefined): PermissionStatus => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined');

/** 웹 브라우저 geolocation — 실패·거부면 null */
function webPosition(timeoutMs = 6000): Promise<LatLng | null> {
  const geo = (globalThis as { navigator?: { geolocation?: Geolocation } }).navigator?.geolocation;
  if (!geo) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: LatLng | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs + 500);
    try {
      geo.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          finish({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/** 현재 위치 권한 상태 (묻지 않음) */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  try {
    if (Platform.OS === 'web') {
      const perms = (globalThis as { navigator?: { permissions?: { query: (q: { name: string }) => Promise<{ state: string }> } } }).navigator?.permissions;
      if (!perms) return 'undetermined';
      const r = await perms.query({ name: 'geolocation' });
      return r.state === 'granted' ? 'granted' : r.state === 'denied' ? 'denied' : 'undetermined';
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    return toStatus(status);
  } catch {
    return 'undetermined';
  }
}

/** 권한 요청 */
export async function requestPermission(): Promise<PermissionStatus> {
  try {
    if (Platform.OS === 'web') return (await webPosition()) ? 'granted' : 'denied';
    const { status } = await Location.requestForegroundPermissionsAsync();
    return toStatus(status);
  } catch {
    return 'denied';
  }
}

/** 현재 좌표. 권한 거부·실패 시 null */
export async function getCurrentPosition(): Promise<LatLng | null> {
  if (Platform.OS === 'web') return webPosition();
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') status = (await Location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** 행정구역 이름 조립 — 빈 칸은 건너뛴다 */
export function joinArea(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  return parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0 && !seen.has(p) && (seen.add(p), true))
    .join(' ');
}

/** 시·도 긴 이름 → 짧은 이름 ("서울특별시" → "서울") */
export function shortRegion(name: string): string {
  return name
    .replace(/특별자치시$|특별자치도$|특별시$|광역시$/, '')
    .replace(/^(경상|전라|충청)(남|북)도$/, (_, a: string, b: string) => `${a[0]}${b}`);
}

async function kakaoRegion(lat: number, lng: number): Promise<string | null> {
  if (!env.kakaoRestKey) return null;
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, {
      headers: { Authorization: `KakaoAK ${env.kakaoRestKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { documents?: { region_type: string; region_1depth_name: string; region_2depth_name: string; region_3depth_name: string }[] };
    const doc = json.documents?.find((d) => d.region_type === 'H') ?? json.documents?.[0];
    if (!doc) return null;
    return joinArea([shortRegion(doc.region_1depth_name), doc.region_2depth_name, doc.region_3depth_name]) || null;
  } catch {
    return null;
  }
}

/** 사용자가 지도에서 고른 위치의 기본 이름 (역지오코딩을 못 할 때) */
export const PINNED_FALLBACK_NAME = '지정한 위치';

interface Coord2AddressDoc {
  address?: { region_1depth_name?: string; region_2depth_name?: string; region_3depth_name?: string } | null;
  road_address?: { region_1depth_name?: string; region_2depth_name?: string; region_3depth_name?: string } | null;
}

/** 카카오 coord2address 응답 → "서울 강남구 역삼동". 동 이름이 없으면 null */
export function areaFromCoord2Address(json: { documents?: Coord2AddressDoc[] } | null | undefined): string | null {
  const doc = json?.documents?.[0];
  const a = doc?.address ?? doc?.road_address;
  if (!a?.region_3depth_name?.trim()) return null;
  return joinArea([a.region_1depth_name ? shortRegion(a.region_1depth_name) : undefined, a.region_2depth_name, a.region_3depth_name]) || null;
}

/**
 * 지도에서 고른 좌표 → 동 이름. 카카오 REST 키가 있으면 coord2address, 없거나 실패하면 "지정한 위치".
 * (GPS 위치 이름은 reverseGeocode 를 그대로 쓴다)
 */
export async function pinnedPlaceName(lat: number, lng: number): Promise<string> {
  if (!env.kakaoRestKey) return PINNED_FALLBACK_NAME;
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
      headers: { Authorization: `KakaoAK ${env.kakaoRestKey}` },
    });
    if (!res.ok) return PINNED_FALLBACK_NAME;
    return areaFromCoord2Address((await res.json()) as { documents?: Coord2AddressDoc[] }) ?? PINNED_FALLBACK_NAME;
  } catch {
    return PINNED_FALLBACK_NAME;
  }
}

/** 좌표 → "서울 강남구 역삼동". expo-location → 카카오 → "현재 위치" */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (Platform.OS !== 'web') {
    try {
      const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (a) {
        const name = joinArea([a.region ? shortRegion(a.region) : a.city, a.district ?? a.subregion, a.street && /동$|읍$|면$/.test(a.street) ? a.street : undefined]);
        if (name) return name;
      }
    } catch {
      // 카카오로 넘어간다
    }
  }
  return (await kakaoRegion(lat, lng)) ?? '현재 위치';
}
