import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { APP_NAME, BottomSheet, Button, Card, ListRow, Screen, StackHeader, TRUST_EXPLAIN, Text, TrustBadge, showToast } from '@/components';
import type { Trust } from '@/domain/types';
import { getRepos } from '@/services/repo';
import { getPermissionStatus, requestPermission, type PermissionStatus } from '@/services/location';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';

const PERM_LABEL: Record<PermissionStatus, string> = { granted: '허용됨', denied: '허용 안 됨', undetermined: '아직 묻지 않았어요' };
const TRUST_ORDER: Trust[] = ['official', 'estimated', 'none', 'user'];

/** 계정 정리: 로그아웃 · 탈퇴 · (게스트) 이 기기 데이터 지우기 */
type Kind = 'logout' | 'withdraw' | 'wipe';

const TITLE: Record<Kind, string> = { logout: '로그아웃할까요?', withdraw: '탈퇴할까요?', wipe: '이 기기 데이터를 지울까요?' };
const ACTION: Record<Kind, string> = { logout: '로그아웃', withdraw: '탈퇴', wipe: '지우기' };

/** F4 설정 — 위치 권한 · 내 기록(어디에 저장되는지) · 영양 정보 출처 안내 · 로그아웃/탈퇴 (게스트는 로그인 · 이 기기 데이터 지우기) */
export default function Settings() {
  const signOut = useProfile((s) => s.signOut);
  const [perm, setPerm] = useState<PermissionStatus>('undetermined');
  const [trustOpen, setTrustOpen] = useState(false);
  const [confirm, setConfirm] = useState<Kind | null>(null);
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

  useFocusEffect(
    useCallback(() => {
      void getPermissionStatus().then(setPerm);
    }, []),
  );

  const onPerm = async () => {
    if (perm === 'granted') return showToast('이미 허용했어요', 'info');
    if (perm === 'denied') return Linking.openSettings().catch(() => showToast('기기 설정에서 위치 권한을 켜 주세요', 'info'));
    setPerm(await requestPermission());
  };

  const doSignOut = async (kind: Kind | null = confirm) => {
    setConfirm(null);
    const k = kind ?? 'logout';
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
        <ListRow
          title="위치 권한"
          subtitle={PERM_LABEL[perm]}
          icon={<Ionicons name="location-outline" size={20} color={colors.ink2} />}
          onPress={onPerm}
          style={styles.row}
        />
        <View style={styles.sep} />
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

      <Text variant="caption" color="ink3" align="center" style={styles.version}>
        {APP_NAME} · {Constants.expoConfig?.version ?? ''}
      </Text>

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

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  row: { paddingHorizontal: spacing.md },
  sep: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fold: { marginTop: spacing.md, gap: spacing.md },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trustText: { flex: 1 },
  version: { marginTop: spacing.xl },
  sheetBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
});
