import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing } from '@/theme';

import { Text } from './Text';

type ToastMsg = { id: number; text: string; kind: 'success' | 'info' };
type Listener = (m: ToastMsg) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** 어디서든 호출: showToast('기록했어요') */
export function showToast(text: string, kind: ToastMsg['kind'] = 'success') {
  const msg = { id: ++seq, text, kind };
  listeners.forEach((l) => l(msg));
}

/** 루트 레이아웃에 한 번 배치 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const l: Listener = (m) => {
      setMsg(m);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => setMsg(null));
      }, 2200);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      if (timer) clearTimeout(timer);
    };
  }, [anim]);

  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 100 }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
      >
        <Ionicons name={msg.kind === 'success' ? 'checkmark-circle' : 'information-circle'} size={20} color={colors.gaugeFill} />
        <Text variant="bodyMedium" color="inkOnPrimary" style={{ marginLeft: spacing.sm }}>
          {msg.text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow.float },
});
