import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, hit, radius, size, spacing, type } from '@/theme';

import { BackIcon, SendIcon } from './icons';
import { MillyAvatar, type MillyPose } from './MillyAvatar';
import { RichText } from './RichText';
import { Text } from './Text';

/**
 * 온보딩 챗봇(밀리) UI 조각 — 시안 Ob-Chat 기준.
 * 밀리: 왼쪽 아바타 + 섹션 배경(#F7F8FA) 말풍선 / 사용자: 오른쪽 진한(#191F28) 말풍선.
 * 선택지는 버튼 스택·칩(선택 시 틴트+그린 테두리), 숫자는 하단 입력바.
 */

const AVATAR = 40;
const GAP = 10;
/** 아바타 없는 이어지는 밀리 말풍선의 들여쓰기 */
export const CHAT_INDENT = AVATAR + GAP;

/** 새로 붙는 말풍선이 살짝 떠오르며 나타나게 */
function FadeIn({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 220, delay, useNativeDriver: false }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
}

/** 상단: 뒤로 · "밀리와 시작하기" · n/7 */
export function ChatHeader({ step, total = 7, title = '밀리와 시작하기', onBack, hideBack }: { step: number; total?: number; title?: string; onBack?: () => void; hideBack?: boolean }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : undefined));
  return (
    <View style={styles.header}>
      {hideBack ? (
        <View style={styles.headerSide} />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={hit} onPress={back} style={styles.headerSide}>
          <BackIcon size={24} color={colors.ink} />
        </Pressable>
      )}
      <Text variant="bodyMedium" style={styles.headerTitle}>
        {title}
      </Text>
      <View style={[styles.headerSide, styles.headerRight]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }} accessibilityLabel={`${total}단계 중 ${step}단계`}>
        <Text variant="captionMedium" color="ink3">
          {step}/{total}
        </Text>
      </View>
    </View>
  );
}

/** 밀리 말풍선 묶음 — 첫 줄에만 아바타·이름, 이어지는 줄은 들여쓰기. 문장 속 **강조**는 그린 Bold */
export function MillySay({ lines, pose = 'base', children, tail, animate }: { lines: string[]; pose?: MillyPose; children?: ReactNode; /** children 아래에 이어지는 말풍선 */ tail?: string[]; animate?: boolean }) {
  const Wrap = animate ? FadeIn : View;
  return (
    <Wrap style={styles.millyGroup}>
      {lines.map((t, i) =>
        i === 0 ? (
          <View key={i} style={styles.millyRow}>
            <MillyAvatar pose={pose} size={AVATAR} />
            <View style={styles.millyCol}>
              <Text variant="label" color="ink2">
                밀리
              </Text>
              <Bubble text={t} />
            </View>
          </View>
        ) : (
          <View key={i} style={styles.indent}>
            <Bubble text={t} />
          </View>
        ),
      )}
      {children ? <View style={styles.indent}>{children}</View> : null}
      {(tail ?? []).map((t, i) => (
        <View key={`t${i}`} style={styles.indent}>
          <Bubble text={t} />
        </View>
      ))}
    </Wrap>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <View style={styles.millyBubble}>
      <RichText variant="body" text={text} style={styles.bubbleText} />
    </View>
  );
}

/** 밀리가 생각 중 — 점 세 개가 차례로 깜빡 */
export function MillyTyping({ label }: { label?: string }) {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, useNativeDriver: false }),
          Animated.timing(d, { toValue: 0.3, duration: 320, useNativeDriver: false }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <FadeIn style={styles.millyRow}>
      <MillyAvatar pose="thinking" size={AVATAR} />
      <View style={styles.millyCol}>
        <Text variant="label" color="ink2">
          밀리
        </Text>
        <View style={[styles.millyBubble, styles.typing]} accessibilityLabel={label ?? '밀리가 생각하는 중'} accessibilityLiveRegion="polite">
          {dots.map((d, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
          ))}
          {label ? (
            <Text variant="caption" color="ink3" style={styles.typingLabel}>
              {label}
            </Text>
          ) : null}
        </View>
      </View>
    </FadeIn>
  );
}

/** 사용자 답 — 오른쪽 진한 말풍선. onPress 가 있으면 눌러서 다시 답할 수 있다 */
export function MeSay({ text, onPress, animate }: { text: string; onPress?: () => void; animate?: boolean }) {
  const Wrap = animate ? FadeIn : View;
  const bubble = (
    <View style={styles.meBubble}>
      <Text variant="body" color="inkOnPrimary" style={styles.bubbleText}>
        {text}
      </Text>
    </View>
  );
  return (
    <Wrap style={styles.meRow}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${text}, 눌러서 다시 답하기`} onPress={onPress} style={({ pressed }) => [styles.meWrap, pressed && { opacity: 0.8 }]}>
          {bubble}
          <Text variant="small" color="ink3" style={styles.editHint}>
            수정
          </Text>
        </Pressable>
      ) : (
        bubble
      )}
    </Wrap>
  );
}

export interface ChoiceItem {
  key: string;
  label: string;
  description?: string;
  selected?: boolean;
  /** 확정 버튼처럼 그린으로 채움 */
  primary?: boolean;
}

/**
 * 선택지 — stack: 세로 버튼 스택(왼쪽 정렬 pill, 설명 있으면 라운드 카드) / wrap: 칩 줄바꿈.
 * 선택 시 틴트 바탕 + 그린 테두리 + 그린 글자.
 */
export function ChoiceList({ items, onSelect, layout = 'stack', style }: { items: ChoiceItem[]; onSelect: (key: string) => void; layout?: 'stack' | 'wrap'; style?: StyleProp<ViewStyle> }) {
  return (
    <FadeIn style={[layout === 'wrap' ? styles.choiceWrap : styles.choiceStack, style]} delay={80}>
      {items.map((it) => {
        const card = !!it.description;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityState={{ selected: !!it.selected }}
            onPress={() => onSelect(it.key)}
            style={({ pressed }) => [
              styles.choice,
              card && styles.choiceCard,
              it.selected && styles.choiceOn,
              it.primary && styles.choicePrimary,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text variant="bodyMedium" style={[styles.choiceLabel, { color: it.primary ? colors.inkOnPrimary : it.selected ? colors.primaryText : colors.ink }, (it.selected || it.primary) && styles.choiceLabelOn]}>
              {it.label}
            </Text>
            {it.description ? (
              <Text variant="small" color={it.selected ? 'primaryText' : 'ink3'} style={styles.choiceDesc}>
                {it.description}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </FadeIn>
  );
}

export interface ChatInputProps {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  placeholder?: string;
  /** 숫자 입력 (숫자 키패드 · 숫자만) */
  numeric?: boolean;
  /** 오른쪽 단위 */
  unit?: string;
  canSend?: boolean;
  /** 입력바 위 안내 (범위 밖 값 등 — 호박색) */
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** 하단 입력바 — 회색 알약 입력칸 + 그린 보내기 버튼 */
export function ChatInput({ value, onChangeText, onSend, placeholder = '직접 입력할 수도 있어요', numeric, unit, canSend, hint, multiline, maxLength, keyboardType, autoFocus, disabled }: ChatInputProps) {
  const ok = (canSend ?? value.trim().length > 0) && !disabled;
  return (
    <View style={styles.inputBar}>
      {hint ? (
        <Text variant="small" color="notice" style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
      <View style={styles.inputRow}>
        <View style={[styles.inputBox, multiline && styles.inputBoxMulti]}>
          <TextInput
            accessibilityLabel={placeholder}
            value={value}
            editable={!disabled}
            onChangeText={(t) => onChangeText(numeric ? t.replace(/[^0-9.]/g, '') : t)}
            placeholder={placeholder}
            placeholderTextColor={colors.ink3}
            keyboardType={keyboardType ?? (numeric ? 'number-pad' : 'default')}
            inputMode={numeric ? 'numeric' : undefined}
            maxLength={maxLength}
            multiline={multiline}
            autoFocus={autoFocus}
            returnKeyType={multiline ? 'default' : 'send'}
            onSubmitEditing={multiline ? undefined : () => ok && onSend()}
            blurOnSubmit={!multiline}
            style={[styles.input, numeric && styles.inputNum, multiline && styles.inputMulti]}
          />
          {unit ? (
            <Text variant="body" color="ink3" style={styles.unit}>
              {unit}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="보내기" accessibilityState={{ disabled: !ok }} disabled={!ok} onPress={onSend} style={[styles.send, !ok && styles.sendOff]}>
          <SendIcon size={20} color={ok ? colors.inkOnPrimary : colors.disabledInk} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * 채팅 화면 틀 — 헤더 · 대화 스크롤(내용이 늘면 맨 아래로) · 하단 입력바/CTA.
 * 대화가 쌓이며 스크롤되는 구조: 지난 단계 히스토리 + 이번 단계 대화를 children 으로.
 */
export function ChatScreen({ header, children, bottom }: { header: ReactNode; children: ReactNode; bottom?: ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const [ready, setReady] = useState(false);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        <ScrollView
          ref={ref}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            ref.current?.scrollToEnd({ animated: ready });
            if (!ready) setReady(true);
          }}
        >
          {children}
        </ScrollView>
        {bottom}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** 하단 CTA 자리 (입력바 대신) */
export function ChatFooter({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { height: size.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: spacing.page, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerSide: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end', width: 34 },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16 },
  thread: { padding: spacing.page, gap: spacing.lg, paddingBottom: spacing.xxl },
  millyGroup: { gap: spacing.sm },
  millyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
  millyCol: { gap: 6, maxWidth: 260, flexShrink: 1 },
  indent: { paddingLeft: CHAT_INDENT },
  millyBubble: { alignSelf: 'flex-start', maxWidth: 260, backgroundColor: colors.section, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: 14 },
  bubbleText: { lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 16 },
  typingLabel: { marginLeft: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ink3 },
  meRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  meWrap: { alignItems: 'flex-end' },
  meBubble: { maxWidth: 240, backgroundColor: colors.ink, borderRadius: radius.lg, borderTopRightRadius: 4, padding: 14 },
  editHint: { marginTop: 4, marginRight: 4 },
  choiceStack: { paddingLeft: CHAT_INDENT, alignItems: 'flex-start', gap: spacing.sm },
  choiceWrap: { paddingLeft: CHAT_INDENT, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: size.touch, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  choiceCard: { alignSelf: 'stretch', borderRadius: radius.lg, paddingVertical: 12 },
  choiceOn: { backgroundColor: colors.primaryTint, borderWidth: 1.5, borderColor: colors.primary },
  choicePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceLabel: { fontSize: 14, lineHeight: 20 },
  choiceLabelOn: { fontFamily: fonts.bold },
  choiceDesc: { marginTop: 2 },
  inputBar: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, paddingHorizontal: spacing.page, paddingBottom: spacing.lg, backgroundColor: colors.bg },
  hint: { marginBottom: spacing.sm, marginLeft: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  inputBox: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: colors.section, paddingHorizontal: 18 },
  inputBoxMulti: { alignItems: 'flex-end', paddingVertical: 12 },
  input: { flex: 1, minWidth: 0, ...type.body, fontSize: 14, color: colors.ink, padding: 0, outlineStyle: 'none' } as never,
  inputNum: { ...type.numberSm, fontSize: 17 },
  inputMulti: { maxHeight: 120, minHeight: 22 },
  unit: { marginLeft: spacing.sm },
  send: { width: size.touch, height: size.touch, borderRadius: size.touch / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendOff: { backgroundColor: colors.disabledBg },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, paddingHorizontal: spacing.page, paddingBottom: spacing.lg, backgroundColor: colors.bg },
});
