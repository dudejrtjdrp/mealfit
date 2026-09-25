import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandTile, Card, EmptyState, MenuTile, Screen, Skeleton, StackHeader, Text, UnknownBadge, VerdictBadge, showToast } from '@/components';
import { getBrand, getMenu } from '@/data';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type Judgement, type MenuItem } from '@/domain/types';
import { getCachedRemoteProduct } from '@/services/products';
import { useDay } from '@/state/day';
import { ensureFavoritesLoaded, useFavorites, type FavoriteEntry } from '@/state/favorites';
import { useJudgeContext } from '@/state/judgeContext';
import { useProfile } from '@/state/profile';
import { colors, radius, size, spacing } from '@/theme';

/** 즐겨찾기 → 메뉴: 앱 번들 > 담을 때 적어 둔 스냅샷(서버 제품) > 이번 실행의 서버 검색 캐시 */
function resolveMenu(f: FavoriteEntry): MenuItem | undefined {
  return getMenu(f.menuId) ?? f.menu ?? getCachedRemoteProduct(f.menuId);
}

/** F 자주 먹는 메뉴 — 하트로 담은 메뉴 전체 · 오늘 남은 양 기준 판정 · 누르면 메뉴 상세 · 하트로 빼기(되돌리기) */
export default function FavoritesScreen() {
  const items = useFavorites((s) => s.items);
  const status = useFavorites((s) => s.status);
  useEffect(ensureFavoritesLoaded, []);

  const targets = useProfile((s) => s.targets);
  const remaining = useDay((s) => s.summary?.remaining) ?? targets;
  const jctx = useJudgeContext();

  const rows = useMemo(
    () =>
      items.map((f) => {
        const menu = resolveMenu(f);
        const judgement = menu && remaining ? judgeMenu(menu, remaining, jctx) : null;
        return { f, menu, judgement };
      }),
    [items, remaining, jctx],
  );

  const removeFav = async (f: FavoriteEntry) => {
    await useFavorites.getState().remove(f.menuId);
    showToast('자주 먹는 메뉴에서 뺐어요', 'info', { label: '되돌리기', onPress: () => void useFavorites.getState().restore(f) });
  };

  let body;
  if (status !== 'ready') {
    body = (
      <View style={styles.skeletons} accessibilityLabel="불러오고 있어요">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} borderRadius={radius.lg} />
        ))}
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        pose="base"
        title="아직 담은 메뉴가 없어요"
        description="메뉴 상세에서 하트를 누르면 여기 모여요"
        actionLabel="주변 메뉴 보러 가기"
        onAction={() => router.navigate('/(tabs)/nearby')}
        style={styles.empty}
      />
    );
  } else {
    body = (
      <>
        <Text variant="caption" color="ink3" style={styles.sub}>
          {rows.length}개 · 기록 추가의 ‘자주 먹어요’에도 먼저 보여요
        </Text>
        <Card padding={spacing.xs} style={styles.card}>
          {rows.map(({ f, menu, judgement }, i) => (
            <FavoriteRow key={f.menuId} entry={f} menu={menu} judgement={judgement} last={i === rows.length - 1} onRemove={() => void removeFav(f)} />
          ))}
        </Card>
      </>
    );
  }

  return (
    <Screen scroll header={<StackHeader title="자주 먹는 메뉴" />}>
      {body}
    </Screen>
  );
}

function FavoriteRow({
  entry,
  menu,
  judgement,
  last,
  onRemove,
}: {
  entry: FavoriteEntry;
  menu: MenuItem | undefined;
  judgement: Judgement | null;
  last: boolean;
  onRemove: () => void;
}) {
  const kcal = menu ? applyOptions(menu)?.kcal : undefined;
  const brandName = menu ? (menu.maker ?? getBrand(menu.brandId)?.name) : undefined;
  const store = entry.storeName ?? brandName;
  const meta = menu
    ? [store, kcal != null ? `${formatNumber(kcal)} kcal` : '아직 추가되지 않은 정보입니다'].filter(Boolean).join(' · ')
    : '메뉴 정보를 다시 찾지 못했어요';
  const unknown = !menu || !judgement || judgement.unknown || kcal == null;

  const open = () => {
    if (menu) router.push({ pathname: '/menu/[id]', params: { id: menu.id, store: store ?? '' } });
  };

  // 행 본문(누르면 메뉴 상세)과 하트(빼기)를 형제로 둔다 — 겹치면 스크린리더가 안쪽 버튼을 못 찾는다
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${meta}${!unknown && judgement ? `, ${VERDICT_LABEL[judgement.verdict]}` : ''}`}
        accessibilityState={{ disabled: !menu }}
        disabled={!menu}
        onPress={open}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        {menu ? <MenuTile menu={menu} size={44} /> : <BrandTile category="other" size={44} />}
        <View style={styles.body}>
          <Text variant="h3" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="small" color="ink3" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {!menu ? null : !unknown && judgement ? <VerdictBadge verdict={judgement.verdict} size="sm" /> : <UnknownBadge />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} 자주 먹는 메뉴에서 빼기`} onPress={onRemove} style={({ pressed }) => [styles.heart, pressed && styles.pressed]}>
        <Ionicons name="heart" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: spacing.xs },
  card: { marginTop: spacing.lg },
  skeletons: { marginTop: spacing.lg, gap: 10 },
  empty: { marginTop: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, minHeight: 72 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, alignSelf: 'stretch' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  heart: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
