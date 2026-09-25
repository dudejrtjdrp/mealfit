import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDistance } from '@/data/labels';
import { FOOD_GROUP_LABEL } from '@/domain/foodGroup';
import type { PlanCandidate, PlanMeal } from '@/domain/mealPlan';
import { formatNumber } from '@/domain/summary';
import type { Nutrients } from '@/domain/types';
import { colors, hit, radius, spacing } from '@/theme';

import { summarizeTrust, TrustBadge, VerdictBadge } from './Badge';
import { MenuTile } from './BrandTile';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';

type MacroKey = 'carbs' | 'protein' | 'fat' | 'sodium';

/** 주 메뉴 + 곁들임 합계 — 하나라도 값이 없으면 그 영양소는 "정보 없음"(undefined) */
function sumNutrients(parts: PlanCandidate[]): Nutrients {
  const total: Nutrients = { kcal: parts.reduce((s, p) => s + p.kcal, 0) };
  (['carbs', 'protein', 'fat', 'sodium'] as MacroKey[]).forEach((k) => {
    if (parts.every((p) => p.nutrients[k] != null)) total[k] = parts.reduce((s, p) => s + (p.nutrients[k] ?? 0), 0);
  });
  return total;
}

const MACROS: { key: MacroKey; label: string; unit: string }[] = [
  { key: 'carbs', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
  { key: 'sodium', label: '나트륨', unit: 'mg' },
];

/** ‹ 2/5 › — 이 끼니만 다른 후보로 넘긴다 */
export function OptionPager({ meal, onCycle }: { meal: PlanMeal; onCycle: (dir: 1 | -1) => void }) {
  const n = meal.options?.length ?? 0;
  if (n < 2) return null;
  const i = (meal.optionIndex ?? 0) + 1;
  return (
    <View style={styles.pager}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${meal.label} 이전 후보`} hitSlop={hit} onPress={() => onCycle(-1)} style={({ pressed }) => [styles.pagerBtn, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={16} color={colors.ink2} />
      </Pressable>
      <Text variant="small" color="ink3" style={styles.pagerText} accessibilityLabel={`후보 ${n}개 중 ${i}번째`}>
        {i}/{n}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${meal.label} 다음 후보`} hitSlop={hit} onPress={() => onCycle(1)} style={({ pressed }) => [styles.pagerBtn, pressed && styles.pressed]}>
        <Ionicons name="chevron-forward" size={16} color={colors.ink2} />
      </Pressable>
    </View>
  );
}

export interface PlanMealSheetProps {
  meal: PlanMeal | null;
  onClose: () => void;
  onStore: (storeId: string) => void;
  onRecord: (meal: PlanMeal) => void;
  /** 이 끼니만 다른 후보로 (없으면 넘기기 버튼을 숨긴다) */
  onCycle?: (dir: 1 | -1) => void;
}

/** 밀리 식단 한 끼 자세히 — 메뉴·매장·이유·영양 요약 + 다른 후보 넘기기 + 매장 보기 / 이걸로 기록 */
export function PlanMealSheet({ meal, onClose, onStore, onRecord, onCycle }: PlanMealSheetProps) {
  const main = meal?.main;
  const parts = main ? [main, ...(meal?.extra ? [meal.extra] : [])] : [];
  const total = parts.length ? sumNutrients(parts) : null;
  const budget = meal?.budgetKcal;
  const ratio = total && budget ? Math.min(1, total.kcal / budget) : 0;
  const trust = summarizeTrust(parts.map((p) => p.menu.trust));

  return (
    <BottomSheet
      visible={!!meal && !!main}
      onClose={onClose}
      title={meal ? `${meal.label}은 이렇게 어때요?` : undefined}
      subtitle={meal?.timeHint}
      footer={
        main && meal ? (
          <View style={styles.buttons}>
            <Button title="매장 보기" variant="outline" height={52} style={styles.flex} onPress={() => onStore(main.store.id)} />
            <Button title="이걸로 기록" height={52} style={styles.flex} onPress={() => onRecord(meal)} />
          </View>
        ) : null
      }
    >
      {main && meal && total ? (
        <View style={styles.body}>
          {onCycle && (meal.options?.length ?? 0) > 1 ? (
            <View style={styles.cycleRow}>
              <Text variant="small" color="ink3" style={styles.flex}>
                {meal.group ? `${FOOD_GROUP_LABEL[meal.group]} · ` : ''}다른 끼니와 겹치지 않는 후보예요
              </Text>
              <OptionPager meal={meal} onCycle={onCycle} />
            </View>
          ) : null}
          <View style={styles.menus}>
            {parts.map((p, i) => (
              <View key={p.menu.id} style={[styles.menuRow, i > 0 && styles.menuLine]}>
                <MenuTile menu={p.menu} size={44} />
                <View style={styles.flex}>
                  <Text variant={i === 0 ? 'h3' : 'bodyMedium'} numberOfLines={2}>
                    {i > 0 ? '+ ' : ''}
                    {p.menu.name}
                  </Text>
                  {p.menu.serving ? (
                    <Text variant="small" color="ink3" numberOfLines={1}>
                      {p.menu.serving}
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" color="ink2">
                  <Text variant="bodyMedium">{formatNumber(Math.round(p.kcal))}</Text> kcal
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.store}>
            <Ionicons name="storefront-outline" size={18} color={colors.ink2} />
            <View style={styles.flex}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {main.store.name}
              </Text>
              <Text variant="small" color="ink3" numberOfLines={2}>
                {formatDistance(main.store.distanceM)}
                {main.store.address ? ` · ${main.store.address}` : ''}
              </Text>
            </View>
          </View>

          {meal.reason ? (
            <View style={styles.reason}>
              <Ionicons name="sparkles-outline" size={15} color={colors.primaryText} style={styles.reasonIcon} />
              <View style={styles.flex}>
                <Text variant="caption" color="ink2">
                  {meal.reason}
                </Text>
                {meal.detail ? (
                  <Text variant="small" color="ink3" style={styles.detail}>
                    {meal.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.nutri}>
            <View style={styles.kcalHead}>
              <Text variant="caption" color="ink2">
                <Text variant="numberSm">{formatNumber(Math.round(total.kcal))}</Text> kcal
              </Text>
              {budget ? (
                <Text variant="small" color="ink3">
                  {meal.label} 적정량 {formatNumber(budget)}kcal
                </Text>
              ) : null}
            </View>
            {budget ? (
              <View style={styles.track} accessibilityLabel={`${meal.label} 적정량 ${formatNumber(budget)}kcal 중 ${formatNumber(Math.round(total.kcal))}kcal`}>
                <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
              </View>
            ) : null}
            <View style={styles.macros}>
              {MACROS.map((m) => (
                <View key={m.key} style={styles.macro}>
                  <Text variant="small" color="ink3">
                    {m.label}
                  </Text>
                  <Text variant="captionMedium" color={total[m.key] == null ? 'ink3' : 'ink'}>
                    {total[m.key] == null ? '정보 없음' : `${formatNumber(Math.round(total[m.key]!))}${m.unit}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.badges}>
            <VerdictBadge verdict={main.judgement.verdict} size="sm" />
            <TrustBadge trust={trust} size="sm" />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { gap: spacing.md, paddingBottom: spacing.xs },
  menus: {},
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  menuLine: { borderTopWidth: 1, borderTopColor: colors.line },
  store: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xs },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryTint },
  reasonIcon: { marginTop: 2 },
  nutri: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.section },
  kcalHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  macros: { flexDirection: 'row', marginTop: spacing.xs },
  macro: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  cycleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detail: { marginTop: 2 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pagerBtn: { width: 26, height: 22, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.section },
  pagerText: { minWidth: 26, textAlign: 'center' },
  pressed: { opacity: 0.6 },
});
