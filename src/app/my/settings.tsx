import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Card, ListRow, Screen, StackHeader, Text, TrustBadge, showToast } from '@/components';
import { getRepos } from '@/services/repo';
import { getPermissionStatus, requestPermission, type PermissionStatus } from '@/services/location';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, radius, spacing } from '@/theme';

const PERM_LABEL: Record<PermissionStatus, string> = { granted: '허용됨', denied: '허용 안 됨', undetermined: '아직 묻지 않았어요' };

/** F4 설정 — 위치 권한 · 신뢰등급 안내 · 데이터 저장 위치 · 로그아웃/탈퇴 */
export default function Settings() {
  const signOut = useProfile((s) => s.signOut);
  const [perm, setPerm] = useState<PermissionStatus>('undetermined');
  const [trustOpen, setTrustOpen] = useState(false);
  const [confirm, setConfirm] = useState<'logout' | 'withdraw' | null>(null);
  const backend = getRepos().backend;
  const cloud = backend === 'supabase';
  const email = useSession((s) => s.session?.email);
  const confirmText = (kind: 'logout' | 'withdraw' | null) =>
    cloud
      ? kind === 'withdraw'
        ? 'Supabase 에 저장된 프로필과 식사 기록이 지워져요.'
        : '기록은 Supabase 에 남아 있어요. 다시 로그인하면 이어서 쓸 수 있어요.'
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

  const doSignOut = async (kind: 'logout' | 'withdraw' | null = confirm) => {
    setConfirm(null);
    await signOut(kind ?? 'logout');
    showToast(kind === 'withdraw' ? (cloud ? '탈퇴했어요 · 저장된 정보를 지웠어요' : '탈퇴했어요 · 이 기기의 정보를 지웠어요') : '로그아웃했어요', 'info');
    void useDay.getState().load();
    router.replace('/login');
  };

  // 네이티브는 시스템 다이얼로그, 웹은 시트
  const ask = (kind: 'logout' | 'withdraw') => {
    if (Platform.OS === 'web') return setConfirm(kind);
    const title = kind === 'withdraw' ? '탈퇴할까요?' : '로그아웃할까요?';
    Alert.alert(title, confirmText(kind), [
      { text: '취소', style: 'cancel' },
      { text: kind === 'withdraw' ? '탈퇴' : '로그아웃', style: 'destructive', onPress: () => void doSignOut(kind) },
    ]);
  };

  return (
    <Screen scroll header={<StackHeader title="설정" />}>
      <Card padding={6} style={styles.card}>
        <ListRow
          title="위치 권한"
          subtitle={PERM_LABEL[perm]}
          icon={<Ionicons name="location-outline" size={22} color={colors.primary} />}
          onPress={onPerm}
          style={styles.row}
        />
        <View style={styles.sep} />
        <ListRow
          title="데이터 저장 위치"
          subtitle={cloud ? `Supabase${email ? ` · ${email}` : ''}` : '이 기기'}
          icon={<Ionicons name={cloud ? 'cloud-outline' : 'phone-portrait-outline'} size={22} color={colors.fat} />}
          iconBg={colors.fatBg}
          chevron={false}
          style={styles.row}
        />
      </Card>

      <Card padding={18} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: trustOpen }} onPress={() => setTrustOpen((v) => !v)} style={styles.foldHead}>
          <Text variant="h3">신뢰등급이란?</Text>
          <Ionicons name={trustOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink2} />
        </Pressable>
        {trustOpen ? (
          <View style={styles.fold}>
            <Text variant="body" color="ink2">
              메뉴마다 영양 정보를 어디서 가져왔는지 함께 보여드려요. 숫자를 지어내지 않아요.
            </Text>
            {(
              [
                ['official', '브랜드가 공개한 영양표를 그대로 옮겼어요.'],
                ['estimated', '공개 자료를 바탕으로 사이즈·옵션을 계산했어요.'],
                ['none', '아직 확인된 정보가 없어요. 판정하지 않아요.'],
                ['user', '직접 입력한 기록이에요.'],
              ] as const
            ).map(([t, d]) => (
              <View key={t} style={styles.trustRow}>
                <TrustBadge trust={t} />
                <Text variant="caption" color="ink2" style={styles.trustText}>
                  {d}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card padding={6} style={styles.card}>
        <ListRow title="로그아웃" icon={<Ionicons name="log-out-outline" size={22} color={colors.ink2} />} iconBg={colors.sodiumBg} onPress={() => ask('logout')} style={styles.row} />
        <View style={styles.sep} />
        <ListRow title="탈퇴하기" subtitle={cloud ? '저장된 프로필과 기록을 지워요.' : '이 기기의 프로필과 세션을 지워요.'} icon={<Ionicons name="person-remove-outline" size={22} color={colors.ink2} />} iconBg={colors.sodiumBg} onPress={() => ask('withdraw')} style={styles.row} />
      </Card>

      <Text variant="caption" color="ink3" align="center" style={styles.version}>
        식사 개인화 · 0.1.0
      </Text>

      <BottomSheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'withdraw' ? '탈퇴할까요?' : '로그아웃할까요?'}
        subtitle={confirmText(confirm)}
        footer={
          <View style={styles.sheetBtns}>
            <Button title="취소" variant="ghost" onPress={() => setConfirm(null)} style={styles.flex} />
            <Button title={confirm === 'withdraw' ? '탈퇴' : '로그아웃'} height={48} onPress={() => void doSignOut()} style={styles.flex} />
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
  sep: { height: 1, backgroundColor: colors.lineSoft, marginHorizontal: spacing.md },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fold: { marginTop: spacing.md, gap: spacing.md },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trustText: { flex: 1 },
  version: { marginTop: spacing.xl },
  sheetBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1, borderRadius: radius.pill },
});
