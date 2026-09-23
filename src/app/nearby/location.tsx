import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, Text, showToast } from '@/components';
import { MapPicker } from '@/components/MapPicker';
import type { LatLng } from '@/domain/geo';
import * as location from '@/services/location';
import { DEMO_AREA, useNearby } from '@/state/nearby';
import { colors, radius, shadow, size, spacing } from '@/theme';

/** gps: 내 위치 그대로 / pinned: 지도에서 고른 위치 */
type Mode = 'gps' | 'pinned';

const key = (c: LatLng) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

/** D1 위치 설정 (주변 탭 위치 헤더에서 여는 모달) — 지도를 움직여 가운데 핀으로 검색 기준 위치를 정한다 */
export default function NearbyLocation() {
  const pinned = useNearby((s) => s.pinned);
  const center = useNearby((s) => s.center);
  const areaName = useNearby((s) => s.areaName);
  const radiusM = useNearby((s) => s.radiusM);

  const [coord, setCoord] = useState<LatLng>(() => pinned?.center ?? center ?? DEMO_AREA.center);
  const [mode, setMode] = useState<Mode>(() => (pinned ? 'pinned' : center ? 'gps' : 'pinned'));
  const [name, setName] = useState<string>(() => pinned?.name ?? (center ? areaName : ''));
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 지금 좌표의 이름 요청 — 확정할 때 끝나지 않았으면 기다린다 */
  const nameReq = useRef<{ key: string; promise: Promise<string> } | null>(null);

  const lookup = (c: LatLng, m: Mode) => {
    const k = `${m}:${key(c)}`;
    if (nameReq.current?.key === k) return nameReq.current.promise;
    const promise = m === 'gps' ? location.reverseGeocode(c.lat, c.lng) : location.pinnedPlaceName(c.lat, c.lng);
    nameReq.current = { key: k, promise };
    setName('');
    void promise.then((n) => {
      if (nameReq.current?.key === k) setName(n);
    });
    return promise;
  };

  // 처음 열었는데 이름이 없으면(권한 없음 등) 찾아 둔다
  useEffect(() => {
    if (!name) void lookup(coord, mode);
    // 마운트 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = (c: LatLng) => {
    setCoord(c);
    setMode('pinned');
    void lookup(c, 'pinned');
  };

  const toMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const pos = (await location.getCurrentPosition()) ?? (Platform.OS === 'web' ? DEMO_AREA.center : null);
      if (!pos) {
        showToast('현재 위치를 찾지 못했어요. 설정에서 위치 권한을 확인해 주세요', 'info');
        return;
      }
      setCoord(pos);
      setMode('gps');
      if (Platform.OS === 'web' && pos === DEMO_AREA.center) {
        nameReq.current = null;
        setName(DEMO_AREA.name);
      } else {
        void lookup(pos, 'gps');
      }
    } finally {
      setLocating(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'));

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const store = useNearby.getState();
      if (mode === 'gps') {
        // 이미 GPS 기준이고 좌표도 그대로면 다시 찾지 않는다
        if (store.pinned || !store.center || key(store.center) !== key(coord)) void store.clearPinnedLocation();
      } else {
        const n = (await lookup(coord, 'pinned').catch(() => location.PINNED_FALLBACK_NAME)) || location.PINNED_FALLBACK_NAME;
        void store.setPinnedLocation(coord, n);
      }
      close();
    } finally {
      setSaving(false);
    }
  };

  const radiusLabel = radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.handle} />
      <View style={styles.head}>
        <Text variant="h2" accessibilityRole="header">
          위치 설정
        </Text>
        <IconButton name="close" label="닫기" color={colors.ink} onPress={close} />
      </View>

      <View style={styles.mapWrap}>
        <MapPicker coord={coord} radiusM={radiusM} onChange={onPick} />

        {Platform.OS !== 'web' ? (
          <View pointerEvents="none" style={styles.hint}>
            <Text variant="captionMedium" color="ink2">
              지도를 움직여 핀을 원하는 곳에 맞춰 주세요
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 위치로"
          accessibilityState={{ busy: locating }}
          onPress={() => void toMyLocation()}
          style={({ pressed }) => [styles.myLoc, pressed && styles.pressed]}
        >
          <Ionicons name={locating ? 'hourglass-outline' : 'locate'} size={18} color={colors.primaryText} />
          <Text variant="captionMedium" color="primaryText">
            {locating ? '찾는 중' : '내 위치로'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text variant="small" color="ink3">
          {mode === 'gps' ? '내 위치' : '선택한 위치'}
        </Text>
        <Text variant="h2" numberOfLines={1} style={styles.name}>
          {name || '위치 이름 찾는 중'}
        </Text>
        <Text variant="caption" color="ink2" style={styles.desc}>
          이 위치에서 {radiusLabel} 안의 매장을 찾아 드려요
        </Text>
        <Button title="이 위치로 설정" loading={saving} onPress={() => void confirm()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.page, paddingRight: spacing.sm, minHeight: size.header },
  mapWrap: { flex: 1, backgroundColor: colors.section, overflow: 'hidden' },
  hint: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadow.float,
  },
  myLoc: {
    position: 'absolute',
    right: spacing.page,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: size.touch,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  pressed: { opacity: 0.85 },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.lg, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  name: { marginTop: 2 },
  desc: { marginTop: spacing.xs, marginBottom: spacing.lg },
});
