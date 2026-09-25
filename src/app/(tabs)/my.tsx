import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, ChevronRightIcon, EmptyState, IconButton, ListRow, Text } from '@/components';
import { GOAL_DESCRIPTION, GOAL_LABEL, bmiInfo } from '@/data/labels';
import { DIET_TYPES } from '@/domain/diet';
import { toDateKey } from '@/domain/summary';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, fonts, radius, size, spacing } from '@/theme';

/** 이번 주(월요일~오늘) 기록한 날 수 — 기록이 바뀌거나 화면에 돌아올 때 다시 센다 */
function useDaysLoggedThisWeek(): number {
  const [days, setDays] = useState(0);
  const logCount = useDay((s) => s.logs.length);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      void useDay
        .getState()
        .datesWithLogs(toDateKey(monday), toDateKey(now))
        .then((d) => {
          if (alive) setDays(d.length);
        });
      return () => {
        alive = false;
      };
    }, [logCount]),
  );
  return days;
}

/** F1 마이 홈 — 프로필(게스트면 로그인 한 줄) · 요약 타일 3장(신체·목표·성향) · 설정 목록 · 프리미엄 미리보기 */
export default function My() {
  const profile = useProfile((s) => s.profile);
  const guest = useSession((s) => !s.session);
  const cloudAvailable = useSession((s) => s.mode === 'supabase');
  const daysLogged = useDaysLoggedThisWeek();

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <EmptyState pose="sleep" title="프로필을 불러오고 있어요" description="잠시만 기다려 주세요." actionLabel="처음으로" onAction={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const { bmi, label: bmiLabel } = bmiInfo(profile.heightCm, profile.weightKg);
  const weightGoal = (profile.primaryGoal === 'lose' || profile.primaryGoal === 'gain') && profile.targetWeightKg != null;
  const diff = weightGoal ? Math.abs(Math.round((profile.weightKg - (profile.targetWeightKg ?? 0)) * 10) / 10) : 0;
  const diet = DIET_TYPES[profile.diet?.type ?? 'balanced'];
  const initial = profile.nickname.trim().slice(0, 1) || '나';

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="h1" accessibilityRole="header" style={styles.headerTitle}>
            마이
          </Text>
          <IconButton name="settings-outline" label="설정" color={colors.ink2} onPress={() => router.push('/my/settings')} />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="프로필 수정" onPress={() => router.push('/my/body')} style={({ pressed }) => [styles.profileRow, pressed && { opacity: 0.8 }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileText}>
            <Text variant="h2" numberOfLines={1}>
              {profile.nickname}님
            </Text>
            <Text variant="caption" color="ink3">
              식사 습관을 천천히 다듬고 있어요.
            </Text>
          </View>
          <Text variant="caption" color="ink3">
            프로필 수정
          </Text>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Pressable>

        {guest && cloudAvailable ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.loginCta, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primaryText} />
            <Text variant="captionMedium" color="primaryText" style={styles.loginCtaText}>
              로그인하고 기록 지키기
            </Text>
            <ChevronRightIcon size={14} color={colors.primaryText} />
          </Pressable>
        ) : null}

        <View style={styles.tiles}>
          <InfoTile title="신체 정보" onPress={() => router.push('/my/body')} pill={bmiLabel}>
            <KV k="키" v={`${profile.heightCm}cm`} />
            <KV k="몸무게" v={`${profile.weightKg}kg`} />
            <KV k="BMI" v={bmi.toFixed(1)} />
          </InfoTile>

          <InfoTile title="목표" onPress={() => router.push('/my/goal')} pill={daysLogged > 0 ? `이번 주 ${daysLogged}일 기록했어요` : undefined}>
            <Text variant="small" color="ink3">
              {weightGoal ? '목표 체중' : '주 목적'}
            </Text>
            <Text style={styles.tileBig} numberOfLines={1}>
              {weightGoal ? `${profile.targetWeightKg}kg` : GOAL_LABEL[profile.primaryGoal]}
            </Text>
            <Text variant="small" color="ink2" style={styles.tileDesc} numberOfLines={3}>
              {weightGoal ? (diff > 0 ? `지금보다 ${diff}kg, 천천히 함께 가요` : '목표에 거의 다 왔어요') : GOAL_DESCRIPTION[profile.primaryGoal]}
            </Text>
          </InfoTile>

          <InfoTile title="식단 성향" onPress={() => router.push('/my/diet')} pill="내 식습관">
            <Text style={styles.tileDiet} numberOfLines={2}>
              {diet.label}
            </Text>
            <Text variant="small" color="ink2" numberOfLines={3} style={styles.tileDesc}>
              {diet.description}
            </Text>
          </InfoTile>
        </View>

        <Card padding={0} style={styles.listCard}>
          <ListRow title="내 정보" subtitle="키, 몸무게, 활동량을 관리해요." icon={<Ionicons name="person-outline" size={20} color={colors.ink2} />} onPress={() => router.push('/my/body')} style={styles.listRow} />
          <View style={styles.sep} />
          <ListRow title="목표 수정" subtitle="목적과 목표 체중, 기간을 바꿀 수 있어요." icon={<MaterialCommunityIcons name="bullseye-arrow" size={20} color={colors.ink2} />} onPress={() => router.push('/my/goal')} style={styles.listRow} />
          <View style={styles.sep} />
          <ListRow title="식단 성향 수정" subtitle="나에게 맞는 식단을 다시 설정해요." icon={<Ionicons name="leaf-outline" size={20} color={colors.ink2} />} onPress={() => router.push('/my/diet')} style={styles.listRow} />
          <View style={styles.sep} />
          <ListRow title="설정" subtitle="위치 권한, 데이터, 계정을 설정해요." icon={<Ionicons name="settings-outline" size={20} color={colors.ink2} />} onPress={() => router.push('/my/settings')} style={styles.listRow} />
        </Card>

        <Pressable accessibilityRole="button" onPress={() => router.push('/my/premium')} style={({ pressed }) => [styles.premium, pressed && { opacity: 0.9 }]}>
          <View style={styles.premiumText}>
            <View style={styles.premiumTop}>
              <Ionicons name="lock-closed" size={14} color={colors.ink3} />
              <Text variant="small" color="ink3">
                프리미엄 미리보기
              </Text>
            </View>
            <Text variant="h2" style={styles.premiumTitle}>
              AI 종합 피드백
            </Text>
            <Text variant="caption" color="ink2" style={styles.premiumSub}>
              한 주의 기록을 더 깊이 돌아봐요.
            </Text>
          </View>
          <View style={styles.illo} pointerEvents="none">
            {[14, 22, 30, 40].map((h, i) => (
              <View key={i} style={[styles.illoBar, { height: h, opacity: 0.35 + i * 0.2 }]} />
            ))}
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text variant="small" color="ink3">
        {k}
      </Text>
      <Text variant="label" color="ink">
        {v}
      </Text>
    </View>
  );
}

/** 요약 타일 — pill 은 실제 데이터로 말할 게 있을 때만 (고정 칭찬 문구 없음) */
function InfoTile({ title, onPress, pill, children }: { title: string; onPress: () => void; pill?: string; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <View style={styles.tileHead}>
        <Text variant="label" color="ink2" numberOfLines={1} style={styles.tileTitle}>
          {title}
        </Text>
        <ChevronRightIcon size={12} color={colors.ink3} />
      </View>
      <View style={styles.tileBody}>{children}</View>
      {pill ? (
        <View style={styles.tilePill}>
          <Text variant="small" color="primaryText" numberOfLines={2} align="center" style={styles.tilePillText}>
            {pill}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: size.header, paddingTop: spacing.sm, marginRight: -spacing.md },
  headerTitle: { flex: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  avatarText: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.ink2 },
  profileText: { flex: 1, minWidth: 0 },
  loginCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.md, minHeight: size.touch, borderRadius: radius.md, backgroundColor: colors.primaryTint },
  loginCtaText: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  tile: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tileTitle: { flexShrink: 1 },
  tileBody: { flex: 1, marginTop: spacing.sm },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  tileBig: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.ink, marginTop: 2 },
  tileDiet: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  tileDesc: { marginTop: 6 },
  tilePill: { marginTop: spacing.md, minHeight: 26, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  tilePillText: { fontFamily: fonts.semibold, fontSize: 11 },
  listCard: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  listRow: {},
  sep: { height: 1, backgroundColor: colors.line },
  premium: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, backgroundColor: colors.section, borderRadius: radius.card, padding: spacing.xl, overflow: 'hidden' },
  premiumText: { flex: 1 },
  premiumTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  premiumTitle: { marginTop: 4 },
  premiumSub: { marginTop: 2 },
  illo: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 44 },
  illoBar: { width: 9, borderRadius: 3, backgroundColor: colors.primary },
});
