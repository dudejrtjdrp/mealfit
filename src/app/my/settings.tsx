import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { BottomSheet, Button, Card, ListRow, Screen, StackHeader, TRUST_EXPLAIN, Text, TrustBadge, showToast } from '@/components';
import type { Trust } from '@/domain/types';
import { CONTACT_EMAIL } from '@/legal/content';
import { getRepos } from '@/services/repo';
import { getPermissionStatus, requestPermission, type PermissionStatus } from '@/services/location';
import { getDevicePermission, requestDevicePermission, type DevicePermission, type PermissionKind } from '@/services/permissions';
import { MEAL_SLOTS, SLOT_LABEL, formatClock, type MealReminderSettings, type MealSlot } from '@/services/mealReminder';
import {
  applyMealReminders,
  clearMealReminders,
  getReminderPermission,
  loadReminderSettings,
  remindersSupported,
  requestReminderPermission,
  saveReminderSettings,
  type ReminderPermission,
} from '@/services/notifications';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';

const PERM_LABEL: Record<DevicePermission, string> = { granted: '허용됨', denied: '허용 안 됨', undetermined: '아직 묻지 않았어요', browser: '쓸 때 브라우저가 물어봐요' };
const APP_VERSION = Constants.expoConfig?.version ?? '';
const TRUST_ORDER: Trust[] = ['official', 'estimated', 'none', 'user'];

/** 계정 정리: 로그아웃 · 탈퇴 · (게스트) 이 기기 데이터 지우기 */
type Kind = 'logout' | 'withdraw' | 'wipe';

const TITLE: Record<Kind, string> = { logout: '로그아웃할까요?', withdraw: '탈퇴할까요?', wipe: '이 기기 데이터를 지울까요?' };
const ACTION: Record<Kind, string> = { logout: '로그아웃', withdraw: '탈퇴', wipe: '지우기' };

const SLOT_ICON: Record<MealSlot, 'sunny-outline' | 'moon-outline'> = { lunch: 'sunny-outline', dinner: 'moon-outline' };

/** 켜진 끼니 시간 한 줄: "점심 오전 11:40 · 저녁 오후 5:40" */
const slotSummary = (r: MealReminderSettings) =>
  MEAL_SLOTS.filter((k) => r[k].on)
    .map((k) => `${SLOT_LABEL[k]} ${formatClock(r[k].hour, r[k].minute)}`)
    .join(' · ');

/** F4 설정 — 권한(위치·카메라·마이크) · 내 기록(어디에 저장되는지) · 식사 시간 알림 · 영양 정보 출처 안내 · 약관·문의·앱 버전 · 로그아웃/탈퇴 (게스트는 로그인 · 이 기기 데이터 지우기) */
export default function Settings() {
  const signOut = useProfile((s) => s.signOut);
  const [perm, setPerm] = useState<PermissionStatus>('undetermined');
  const [camPerm, setCamPerm] = useState<DevicePermission>('undetermined');
  const [micPerm, setMicPerm] = useState<DevicePermission>('undetermined');
  const [trustOpen, setTrustOpen] = useState(false);
  const [confirm, setConfirm] = useState<Kind | null>(null);
  // 식사 시간 알림 (웹은 섹션 자체를 그리지 않는다)
  const [rem, setRem] = useState<MealReminderSettings | null>(null);
  const [notifPerm, setNotifPerm] = useState<ReminderPermission>('undetermined');
  // 켜려다 권한이 없어 못 켰음 → 기기 설정에서 허용하고 돌아오면 바로 켜 준다
  const wantOnRef = useRef(false);
  const [wantOn, setWantOnState] = useState(false);
  // 스위치를 처리하는 동안(권한 창이 떠서 앱이 잠깐 비활성 → 활성) 다시 읽기가 끼어들어 스위치를 되돌리지 않게
  const busyRef = useRef(false);
  const setWantOn = useCallback((v: boolean) => {
    wantOnRef.current = v;
    setWantOnState(v);
  }, []);
  const cloud = getRepos().backend === 'supabase';
  const guest = useSession((s) => !s.session);
  const cloudAvailable = useSession((s) => s.mode === 'supabase');
  const email = useSession((s) => s.session?.email);
  const confirmText = (kind: Kind | null) =>
    kind === 'wipe'
      ? '이 기기에 저장된 프로필과 식사 기록이 지워져요. 처음부터 다시 시작해요.'
      : cloud
        ? kind === 'withdraw'
          ? '계정에 저장된 프로필과 식사 기록이 지워져요.'
          : '기록은 계정에 남아 있어요. 다시 로그인하면 이어서 쓸 수 있어요.'
        : '이 기기에 저장된 프로필과 세션이 지워져요.';

  const enableReminders = useCallback(async (base: MealReminderSettings) => {
    // 끼니가 다 꺼져 있었으면 둘 다 켠다 — 켰는데 아무 알림도 없는 상태를 만들지 않게
    const none = MEAL_SLOTS.every((k) => !base[k].on);
    const next: MealReminderSettings = {
      ...base,
      enabled: true,
      lunch: { ...base.lunch, on: none || base.lunch.on },
      dinner: { ...base.dinner, on: none || base.dinner.on },
    };
    setWantOn(false);
    setRem(next);
    await saveReminderSettings(next);
    showToast(`${slotSummary(next)}에 알려드릴게요`, 'success');
  }, [setWantOn]);

  /** 권한 상태를 다시 읽는다 (화면 복귀·기기 설정에서 돌아왔을 때) */
  const refreshReminders = useCallback(async () => {
    if (!remindersSupported || busyRef.current) return;
    const [r, p] = await Promise.all([loadReminderSettings(), getReminderPermission()]);
    setNotifPerm(p);
    if (p === 'granted' && wantOnRef.current && !r.enabled) return enableReminders(r);
    setRem(r);
    // 기기 설정에서 알림을 다시 허용했을 수 있으니 켜져 있으면 예약을 다시 건다 (같은 id 라 중복 없음)
    if (p === 'granted' && r.enabled) void applyMealReminders(r);
  }, [enableReminders]);

  /** 위치·카메라·마이크 권한 다시 읽기 (화면 복귀·기기 설정에서 돌아왔을 때) */
  const refreshPerms = useCallback(() => {
    void getPermissionStatus().then(setPerm);
    void getDevicePermission('camera').then(setCamPerm);
    void getDevicePermission('microphone').then(setMicPerm);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPerms();
      void refreshReminders();
    }, [refreshPerms, refreshReminders]),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshPerms();
    });
    return () => sub.remove();
  }, [refreshPerms]);

  useEffect(() => {
    if (!remindersSupported) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refreshReminders();
    });
    return () => sub.remove();
  }, [refreshReminders]);

  const openDeviceSettings = () => Linking.openSettings().catch(() => showToast('기기 설정에서 알림을 켜 주세요', 'info'));

  const onToggleReminders = async (on: boolean) => {
    if (!rem || busyRef.current) return;
    busyRef.current = true;
    try {
      await toggleReminders(rem, on);
    } finally {
      busyRef.current = false;
    }
  };

  const toggleReminders = async (cur: MealReminderSettings, on: boolean) => {
    if (!on) {
      setWantOn(false);
      const next = { ...cur, enabled: false };
      setRem(next);
      await saveReminderSettings(next);
      return showToast('식사 시간 알림을 껐어요', 'info');
    }
    const p = await requestReminderPermission();
    setNotifPerm(p);
    if (p !== 'granted') {
      setWantOn(true);
      return showToast('기기 설정에서 알림을 켜 주세요', 'info', { label: '설정 열기', onPress: openDeviceSettings });
    }
    await enableReminders(cur);
  };

  const onToggleSlot = async (slot: MealSlot, on: boolean) => {
    if (!rem) return;
    const next: MealReminderSettings = { ...rem, [slot]: { ...rem[slot], on } };
    // 두 끼 다 끄면 전체도 끈다 — 켜져 있는데 아무것도 안 오는 상태를 남기지 않게
    if (MEAL_SLOTS.every((k) => !next[k].on)) next.enabled = false;
    setRem(next);
    await saveReminderSettings(next);
    showToast(
      on ? `${SLOT_LABEL[slot]} ${formatClock(rem[slot].hour, rem[slot].minute)}에 알려드릴게요` : next.enabled ? `${SLOT_LABEL[slot]} 알림을 껐어요` : '식사 시간 알림을 껐어요',
      on ? 'success' : 'info',
    );
  };

  const remindersBlocked = notifPerm === 'denied' && (wantOn || !!rem?.enabled);

  const onPerm = async () => {
    if (perm === 'granted') return showToast('이미 허용했어요', 'info');
    if (perm === 'denied') return Linking.openSettings().catch(() => showToast('기기 설정에서 위치 권한을 켜 주세요', 'info'));
    setPerm(await requestPermission());
  };

  const onDevicePerm = async (kind: PermissionKind, cur: DevicePermission, set: (p: DevicePermission) => void) => {
    if (cur === 'browser') return showToast('사진·음성을 쓸 때 브라우저가 권한을 물어봐요', 'info');
    if (cur === 'granted') return showToast('이미 허용했어요', 'info');
    const what = kind === 'camera' ? '카메라' : '마이크';
    if (cur === 'denied') return Linking.openSettings().catch(() => showToast(`기기 설정에서 ${what} 권한을 켜 주세요`, 'info'));
    set(await requestDevicePermission(kind));
  };

  const onContact = () => {
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[mealing] 문의 (v${APP_VERSION})`)}`;
    Linking.openURL(url).catch(() => showToast(`${CONTACT_EMAIL} 로 보내 주세요`, 'info'));
  };

  const doSignOut = async (kind: Kind | null = confirm) => {
    setConfirm(null);
    const k = kind ?? 'logout';
    // 다음에 이 기기를 쓰는 사람에게 알림이 가지 않게 예약을 모두 취소하고 스위치도 끈다
    await clearMealReminders();
    setWantOn(false);
    setRem(null);
    // 게스트의 "이 기기 데이터 지우기"는 로컬 저장소 탈퇴와 같다 (프로필·기록 삭제)
    await signOut(k === 'logout' ? 'logout' : 'withdraw');
    showToast(k === 'wipe' ? '이 기기의 데이터를 지웠어요' : k === 'withdraw' ? (cloud ? '탈퇴했어요 · 저장된 정보를 지웠어요' : '탈퇴했어요 · 이 기기의 정보를 지웠어요') : '로그아웃했어요', 'info');
    void useDay.getState().load();
    // 진입 게이트가 다시 정한다: 이 기기에 프로필이 없으면 온보딩(첫 화면에서 로그인 가능)
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  };

  // 네이티브는 시스템 다이얼로그, 웹은 시트
  const ask = (kind: Kind) => {
    if (Platform.OS === 'web') return setConfirm(kind);
    Alert.alert(TITLE[kind], confirmText(kind), [
      { text: '취소', style: 'cancel' },
      { text: ACTION[kind], style: 'destructive', onPress: () => void doSignOut(kind) },
    ]);
  };

  return (
    <Screen scroll header={<StackHeader title="설정" />}>
      <Card padding={spacing.xs} style={styles.card}>
        <PermRow title="위치 권한" icon="location-outline" status={perm} onPress={onPerm} />
        <View style={styles.sep} />
        <PermRow title="카메라" icon="camera-outline" status={camPerm} onPress={() => void onDevicePerm('camera', camPerm, setCamPerm)} />
        <View style={styles.sep} />
        <PermRow title="마이크 · 음성 인식" icon="mic-outline" status={micPerm} onPress={() => void onDevicePerm('microphone', micPerm, setMicPerm)} />
      </Card>

      <Card padding={spacing.xs} style={styles.card}>
        <ListRow
          title="내 기록"
          subtitle={cloud ? `계정에 저장돼요${email ? ` · ${email}` : ''}` : '이 기기에만 저장돼요'}
          icon={<Ionicons name={cloud ? 'cloud-outline' : 'phone-portrait-outline'} size={20} color={colors.ink2} />}
          chevron={false}
          style={styles.row}
        />
        {guest ? (
          <>
            <View style={styles.sep} />
            <ListRow
              title="로그인하기"
              subtitle={cloudAvailable ? '계정에 저장하면 휴대폰을 바꿔도 이어서 볼 수 있어요.' : '로그인하면 이름으로 불러드릴게요.'}
              icon={<Ionicons name="log-in-outline" size={20} color={colors.ink2} />}
              onPress={() => router.push('/login')}
              style={styles.row}
            />
          </>
        ) : null}
      </Card>

      {remindersSupported ? (
        <Card padding={spacing.xs} style={styles.card}>
          <ListRow
            title="식사 시간 알림"
            subtitle={rem?.enabled ? '먹기 전에 한 번씩 알려드려요.' : '점심·저녁 먹기 전에 지금 먹기 좋은 메뉴를 알려드려요.'}
            icon={<Ionicons name="notifications-outline" size={20} color={colors.ink2} />}
            chevron={false}
            right={
              <Switch
                accessibilityLabel="식사 시간 알림"
                value={!!rem?.enabled}
                disabled={!rem}
                onValueChange={(v) => void onToggleReminders(v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
              />
            }
            style={styles.row}
          />
          {remindersBlocked ? (
            <>
              <View style={styles.sep} />
              <ListRow
                title="기기 설정에서 알림을 켜 주세요"
                subtitle="설정 열기 · 허용하고 돌아오면 바로 켜져요."
                icon={<Ionicons name="settings-outline" size={20} color={colors.ink2} />}
                onPress={openDeviceSettings}
                style={styles.row}
              />
            </>
          ) : null}
          {rem?.enabled
            ? MEAL_SLOTS.map((slot) => (
                <View key={slot}>
                  <View style={styles.sep} />
                  <ListRow
                    title={SLOT_LABEL[slot]}
                    subtitle={`매일 ${formatClock(rem[slot].hour, rem[slot].minute)}`}
                    icon={<Ionicons name={SLOT_ICON[slot]} size={20} color={colors.ink2} />}
                    chevron={false}
                    right={
                      <Switch
                        accessibilityLabel={`${SLOT_LABEL[slot]} 알림`}
                        value={rem[slot].on}
                        onValueChange={(v) => void onToggleSlot(slot, v)}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor={colors.surface}
                        ios_backgroundColor={colors.border}
                      />
                    }
                    style={styles.row}
                  />
                </View>
              ))
            : null}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: trustOpen }} onPress={() => setTrustOpen((v) => !v)} style={styles.foldHead}>
          <Text variant="h3">영양 정보는 어디서 왔나요?</Text>
          <Ionicons name={trustOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink3} />
        </Pressable>
        {trustOpen ? (
          <View style={styles.fold}>
            <Text variant="caption" color="ink2">
              메뉴마다 영양 정보를 어디서 가져왔는지 함께 보여드려요. 숫자를 지어내지 않아요.
            </Text>
            {TRUST_ORDER.map((t) => (
              <View key={t} style={styles.trustRow}>
                <TrustBadge trust={t} explain={false} />
                <Text variant="caption" color="ink2" style={styles.trustText}>
                  {TRUST_EXPLAIN[t]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card padding={spacing.xs} style={styles.card}>
        <ListRow title="이용약관" icon={<Ionicons name="document-text-outline" size={20} color={colors.ink2} />} onPress={() => router.push('/legal/terms')} style={styles.row} />
        <View style={styles.sep} />
        <ListRow title="개인정보처리방침" icon={<Ionicons name="shield-checkmark-outline" size={20} color={colors.ink2} />} onPress={() => router.push('/legal/privacy')} style={styles.row} />
        <View style={styles.sep} />
        <ListRow title="문의하기" subtitle={CONTACT_EMAIL} icon={<Ionicons name="mail-outline" size={20} color={colors.ink2} />} onPress={onContact} style={styles.row} />
        <View style={styles.sep} />
        <ListRow
          title="앱 버전"
          icon={<Ionicons name="information-circle-outline" size={20} color={colors.ink2} />}
          chevron={false}
          right={
            <Text variant="caption" color="ink3">
              {APP_VERSION || '확인할 수 없어요'}
            </Text>
          }
          style={styles.row}
        />
      </Card>

      <Card padding={spacing.xs} style={styles.card}>
        {guest ? (
          <ListRow title="이 기기 데이터 지우기" subtitle="이 기기에 저장된 프로필과 기록을 지워요." icon={<Ionicons name="trash-outline" size={20} color={colors.ink2} />} onPress={() => ask('wipe')} style={styles.row} />
        ) : (
          <>
            <ListRow title="로그아웃" icon={<Ionicons name="log-out-outline" size={20} color={colors.ink2} />} onPress={() => ask('logout')} style={styles.row} />
            <View style={styles.sep} />
            <ListRow title="탈퇴하기" subtitle={cloud ? '계정에 저장된 프로필과 기록을 지워요.' : '이 기기의 프로필과 세션을 지워요.'} icon={<Ionicons name="person-remove-outline" size={20} color={colors.ink2} />} onPress={() => ask('withdraw')} style={styles.row} />
          </>
        )}
      </Card>


      <BottomSheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? TITLE[confirm] : undefined}
        subtitle={confirmText(confirm)}
        footer={
          <View style={styles.sheetBtns}>
            <Button title="취소" variant="ghost" onPress={() => setConfirm(null)} style={styles.flex} />
            <Button title={confirm ? ACTION[confirm] : ''} onPress={() => void doSignOut()} style={styles.flex} />
          </View>
        }
      >
        <View />
      </BottomSheet>
    </Screen>
  );
}

/** 권한 한 줄 — 상태 표시, 거부됐으면 오른쪽에 "설정 열기" (누르면 기기 설정) */
function PermRow({ title, icon, status, onPress }: { title: string; icon: keyof typeof Ionicons.glyphMap; status: DevicePermission; onPress: () => void }) {
  return (
    <ListRow
      title={title}
      subtitle={PERM_LABEL[status]}
      icon={<Ionicons name={icon} size={20} color={colors.ink2} />}
      onPress={onPress}
      right={
        status === 'denied' ? (
          <Text variant="captionMedium" color="primaryText">
            설정 열기
          </Text>
        ) : undefined
      }
      style={styles.row}
    />
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  row: { paddingHorizontal: spacing.md },
  sep: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fold: { marginTop: spacing.md, gap: spacing.md },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trustText: { flex: 1 },
  sheetBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
});
