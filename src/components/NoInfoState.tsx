import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hasRequestedInfo, requestStoreInfo, type InfoRequestTarget } from '@/services/infoRequests';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { MillyAvatar } from './MillyAvatar';
import { Text } from './Text';
import { showToast } from './Toast';

export interface NoInfoStateProps {
  /** "근처 다른 매장 보기" */
  onOtherStores?: () => void;
  /** "직접 기록하기" */
  onManualLog?: () => void;
  /** 이유 한 줄 (기본: 영양표시 의무가 없는 매장) */
  reason?: string;
  /** 있으면 "이 매장 정보 요청하기" 버튼 — 한 매장은 한 번만 (이미 요청했으면 "요청했어요") */
  requestTarget?: InfoRequestTarget;
  style?: StyleProp<ViewStyle>;
}

/** D6 정보 없음 — 숫자를 지어내지 않고 이유 + 대안 행동 (+ 정보 요청) */
export function NoInfoState({ onOtherStores, onManualLog, reason = '영양표시 의무가 없는 매장이에요.\n확인된 정보만 보여드려요.', requestTarget, style }: NoInfoStateProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="summary">
      <MillyAvatar pose="sorry" size={80} />
      <Text variant="h2" align="center" style={styles.title}>
        아직 추가되지 않은 정보입니다
      </Text>
      <Text variant="caption" color="ink2" align="center" style={styles.desc}>
        {reason}
      </Text>
      {requestTarget ? <RequestInfoButton target={requestTarget} /> : null}
      <View style={styles.actions}>
        {onOtherStores ? <Button title="근처 다른 매장 보기" onPress={onOtherStores} /> : null}
        {onManualLog ? <Button title="직접 기록하기" variant="outline" onPress={onManualLog} /> : null}
      </View>
    </View>
  );
}

/** "이 매장 정보 요청하기" — 누르면 요청을 남기고 "요청했어요"로 바뀐다. 저장 실패는 드러내지 않는다(서비스가 로컬로 폴백) */
function RequestInfoButton({ target }: { target: InfoRequestTarget }) {
  const [state, setState] = useState<'checking' | 'idle' | 'sending' | 'done'>('checking');
  const { name, brandId, placeId } = target;

  useEffect(() => {
    let alive = true;
    setState('checking');
    hasRequestedInfo({ name, brandId, placeId })
      .then((done) => alive && setState(done ? 'done' : 'idle'))
      .catch(() => alive && setState('idle'));
    return () => {
      alive = false;
    };
  }, [name, brandId, placeId]);

  const onPress = async () => {
    if (state !== 'idle') return;
    setState('sending');
    try {
      await requestStoreInfo({ name, brandId, placeId });
    } catch (e) {
      console.warn('[NoInfoState] 정보 요청 저장 실패', e);
    }
    setState('done');
    showToast('요청을 모아서 먼저 추가할게요');
  };

  const done = state === 'done';
  return (
    <Button
      title={done ? '요청했어요' : '이 매장 정보 요청하기'}
      variant="tint"
      height={48}
      disabled={done || state === 'checking'}
      loading={state === 'sending'}
      left={<Ionicons name={done ? 'checkmark' : 'hand-left-outline'} size={18} color={done ? colors.disabledInk : colors.primaryText} />}
      accessibilityLabel={done ? '이 매장 정보는 이미 요청했어요' : '이 매장 정보 요청하기'}
      onPress={() => void onPress()}
      style={styles.request}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xs },
  title: { marginTop: spacing.xl },
  desc: { marginTop: spacing.sm },
  request: { alignSelf: 'stretch', marginTop: spacing.xl },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
