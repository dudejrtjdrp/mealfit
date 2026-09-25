import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow, spacing } from '@/theme';

import { Text } from './Text';

/** 토스트 오른쪽 글자 버튼 (예: 되돌리기) — 누르면 실행하고 바로 닫힌다 */
export interface ToastAction {
  label: string;
  onPress: () => void;
}
type ToastMsg = { id: number; text: string; kind: 'success' | 'info'; action?: ToastAction };
type Listener = (m: ToastMsg) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** 보이는 시간 — 누를 게 있으면 조금 더 길게 */
const DURATION = 2200;
const DURATION_ACTION = 4000;

/** 어디서든 호출: showToast('기록했어요') · showToast('지웠어요', 'info', { label: '되돌리기', onPress }) */
export function showToast(text: string, kind: ToastMsg['kind'] = 'success', action?: ToastAction) {
  const msg = { id: ++seq, text, kind, action };
  listeners.forEach((l) => l(msg));
}

/** 루트 레이아웃에 한 번 배치 — 진한 알약 + 그린 체크 (+ 액션 버튼) */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => setMsg(null));
  }, [anim]);

  useEffect(() => {
    const l: Listener = (m) => {
      setMsg(m);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, m.action ? DURATION_ACTION : DURATION);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [anim, hide]);

  if (!msg) return null;
  const action = msg.action;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 100 }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        pointerEvents={action ? 'box-none' : 'none'}
        style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
      >
        <Ionicons name={msg.kind === 'success' ? 'checkmark-circle' : 'information-circle'} size={20} color={msg.kind === 'success' ? colors.primary : colors.ink3} />
        <Text variant="bodyMedium" color="inkOnPrimary" style={styles.text}>
          {msg.text}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={8}
            onPress={() => {
              hide();
              action.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text variant="bodyMedium" color="primary" style={styles.actionText}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.page, right: spacing.page, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow.float },
  text: { marginLeft: spacing.sm, flexShrink: 1 },
  action: { marginLeft: spacing.md, marginRight: -spacing.sm, paddingHorizontal: spacing.sm, minHeight: 28, justifyContent: 'center', borderRadius: radius.pill },
  actionPressed: { opacity: 0.6 },
  actionText: { fontFamily: fonts.bold },
});
