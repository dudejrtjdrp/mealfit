import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ChatFooter,
  ChatHeader,
  ChatScreen,
  ChoiceList,
  EmptyState,
  KcalRing,
  MenuTile,
  MeSay,
  MillySay,
  MillyTyping,
  NutrientBar,
  Text,
  VerdictBadge,
  showToast,
  type NutrientKey,
} from '@/components';
import { getBrand, getMenusByBrand } from '@/data';
import { applyOptions, rankMenus } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import { ChatHistory, useHistory, useNickname } from '@/onboarding/common';
import { FIRST_PICK_TIMEOUT_MS, pickFirstVerdict, type FirstPick } from '@/onboarding/firstPick';
import { SAY } from '@/onboarding/script';
import { judgeProfile } from '@/state/bootstrap';
import { DEMO_AREA, useNearby } from '@/state/nearby';
import { useOnboarding } from '@/state/onboarding';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, radius, spacing } from '@/theme';

type Perm = 'idle' | 'asking' | 'granted' | 'denied' | 'later';
/** 첫 판정 체험: 고르는 중 · 보여줌 · 보여줄 메뉴 없음(체험 없이 넘어감) */
type PickState = { status: 'idle' | 'loading' | 'none' } | { status: 'ready'; pick: FirstPick };
const BAR_KEYS: NutrientKey[] = ['carbs', 'protein', 'fat', 'sugar', 'sodium'];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * B7 오늘 목표량 첫 소개 + 위치 권한 프라이밍 → 첫 판정 체험 — 프로필 저장은 진입 시 1회 (기존과 같음).
 * 위치를 허용하면 근처 매장에서 지금 먹기 좋은 메뉴 1위를, 거부·실패·4초 넘게 걸리면 대표 브랜드 예시 메뉴를 판정해 보여준다.
 * 코치마크·설명 팝업 대신 이 한 장이 튜토리얼이다. 다음 → 게스트면 로그인 권유, 로그인했으면 오늘 탭.
 */
export default function Step7() {
  const draft = useOnboarding((s) => s.draft);
  const nickname = useNickname();
  const { targets, completeOnboarding } = useProfile();
  const [done, setDone] = useState(false);
  const [perm, setPerm] = useState<Perm>('idle');
  const [pick, setPick] = useState<PickState>({ status: 'idle' });
  const history = useHistory(7);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const { saved } = await completeOnboarding(draft, nickname);
      if (!saved) console.warn('[B7] 프로필 저장 실패 — 이번 실행 동안 메모리로 유지');
      if (alive.current) setDone(true);
    })();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 첫 판정: 위치를 허용했으면 근처 매장을 불러(최대 4초) 1위, 아니면 예시 */
  const runFirstPick = async (granted: boolean) => {
    const t = useProfile.getState().targets;
    if (!t) return setPick({ status: 'none' });
    setPick({ status: 'loading' });
    const started = Date.now();
    if (granted) {
      const nb = useNearby.getState();
      const loaded = nb.status === 'ready' && nb.stores.length > 0 ? Promise.resolve() : nb.refresh();
      await Promise.race([loaded.catch(() => undefined), sleep(FIRST_PICK_TIMEOUT_MS)]);
    }
    // 밀리가 살펴보는 모습이 잠깐은 보이게
    const wait = 700 - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (!alive.current) return;
    const nb = useNearby.getState();
    // 목 매장·데모 동네는 실제 근처가 아니므로 "근처"라고 하지 않고 예시로 보여준다
    const nearbyIsReal = granted && nb.status === 'ready' && nb.source === 'kakao' && nb.center !== DEMO_AREA.center;
    const ctx = { profile: judgeProfile(useProfile.getState().profile) };
    let res: FirstPick | null = null;
    try {
      res = pickFirstVerdict({ stores: nb.stores, nearbyIsReal, menusOf: getMenusByBrand, rank: (menus) => rankMenus(menus, t, ctx) });
    } catch (e) {
      console.warn('[B7] 첫 판정 실패 — 체험 없이 넘어감', e);
    }
    if (alive.current) setPick(res ? { status: 'ready', pick: res } : { status: 'none' });
  };

  const askLocation = async () => {
    setPerm('asking');
    let granted = false;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      granted = status === 'granted';
      if (granted) showToast('위치를 허용했어요');
    } catch {
      granted = false;
    }
    setPerm(granted ? 'granted' : 'denied');
    void runFirstPick(granted);
  };

  /** 로그인은 온보딩 뒤로: 게스트면 로그인 권유 화면("나중에 할게요" 가능), 이미 로그인했으면 바로 오늘 탭 */
  const start = () => {
    useOnboarding.getState().reset();
    if (useSession.getState().session) router.replace('/(tabs)/today');
    else router.replace({ pathname: '/login', params: { from: 'onboarding' } });
  };

  // 강조 영양소 순서대로 바 3개 (emphasis 에 kcal 이 있으면 링이 대신하므로 제외)
  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).filter((k) => BAR_KEYS.includes(k)).slice(0, 3) : [];
  const answered = perm === 'granted' || perm === 'denied' || perm === 'later';
  const finished = pick.status === 'ready' || pick.status === 'none';

  return (
    <ChatScreen
      header={<ChatHeader step={7} />}
      bottom={
        finished ? (
          <ChatFooter>
            <Button title="다음" onPress={start} />
          </ChatFooter>
        ) : null
      }
    >
      <ChatHistory lines={history} />
      {!done ? (
        <MillyTyping />
      ) : targets ? (
        <MillySay pose="cheer" lines={[SAY.target(formatNumber(targets.kcal))]} tail={[SAY.targetSub]} animate>
          <Card padding={spacing.lg} style={styles.card}>
            <View style={styles.gaugeRow}>
              <KcalRing value={targets.kcal} progress={1} caption="kcal 목표" size={112} stroke={10} numberSize={24} />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} max={targets[k]} />
                ))}
              </View>
            </View>
          </Card>
        </MillySay>
      ) : (
        <EmptyState pose="sorry" title="목표량을 아직 계산하지 못했어요" description="오늘 탭에서 다시 계산해 보여드릴게요." style={styles.empty} />
      )}

      {done ? <MillySay lines={[SAY.location]} animate /> : null}
      {done && !answered ? (
        <ChoiceList
          items={[
            { key: 'yes', label: perm === 'asking' ? '확인하는 중…' : SAY.locationYes, primary: true },
            { key: 'later', label: SAY.locationLater },
          ]}
          onSelect={(k) => {
            if (perm !== 'idle') return;
            if (k === 'yes') void askLocation();
            else {
              setPerm('later');
              void runFirstPick(false);
            }
          }}
        />
      ) : null}
      {answered ? (
        <>
          <MeSay text={perm === 'later' ? SAY.locationLater : SAY.locationYes} animate />
          <MillySay pose={perm === 'granted' ? 'cheer' : 'base'} lines={[perm === 'granted' ? SAY.locationGranted : perm === 'denied' ? SAY.locationDenied : SAY.locationLaterReply]} animate />
        </>
      ) : null}

      {pick.status === 'loading' ? <MillyTyping /> : null}
      {pick.status === 'ready' ? <FirstPickCard pick={pick.pick} /> : null}
    </ChatScreen>
  );
}

/** 첫 판정 카드 — 판정 배지(색+단어) · 메뉴명 · kcal · 이유 한 줄. 예시면 "예시 메뉴예요"를 밝힌다 */
function FirstPickCard({ pick }: { pick: FirstPick }) {
  const { menu, judgement, example } = pick;
  const good = judgement.verdict === 'good';
  const kcal = applyOptions(menu)?.kcal;
  const brand = getBrand(menu.brandId)?.name;
  const where = example ? ['예시 메뉴예요', brand].filter(Boolean).join(' · ') : [pick.storeName, pick.distanceM != null ? `${formatNumber(pick.distanceM)}m` : null].filter(Boolean).join(' · ');
  return (
    <MillySay pose="cheer" lines={[example ? SAY.firstPickExample(good) : SAY.firstPick(good)]} tail={[SAY.firstPickTail]} animate>
      <Card padding={spacing.lg} style={styles.card} accessibilityLabel={`${menu.name} 판정`}>
        <View style={styles.pickHead}>
          <MenuTile menu={menu} size={44} />
          <View style={styles.pickText}>
            <Text variant="h3" numberOfLines={2}>
              {menu.name}
            </Text>
            {where ? (
              <Text variant="small" color="ink3" numberOfLines={1}>
                {where}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.pickRow}>
          <VerdictBadge verdict={judgement.verdict} />
          {kcal != null ? (
            <Text variant="label" color="ink2">
              {formatNumber(Math.round(kcal))}kcal
            </Text>
          ) : null}
        </View>
        {judgement.reasons[0] ? (
          <Text variant="caption" color="ink2" style={styles.reason}>
            {judgement.reasons[0]}
          </Text>
        ) : null}
      </Card>
    </MillySay>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 300, alignSelf: 'stretch' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  bars: { flex: 1, gap: spacing.md, minWidth: 0 },
  empty: { paddingVertical: spacing.lg },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pickText: { flex: 1, minWidth: 0, gap: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  reason: { marginTop: spacing.sm, backgroundColor: colors.section, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
