import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MAX_REQUESTS, REQUEST_MAX_LENGTH, prefTagKey, prefTagLabel, type AssistantRequest, type PrefTag } from '@/domain/preferences';
import { parseRequest } from '@/services/ai/parsePreference';
import { SPEECH_ERROR_TEXT, speechErrorNeedsSettings, useSpeechInput } from '@/services/speech';
import { ensurePreferencesLoaded, usePreferences } from '@/state/preferences';
import { colors, radius, spacing, type } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Text } from './Text';

/** 예시 — 누르면 입력칸에 채운다 */
export const REQUEST_EXAMPLES = ['아침엔 샐러드 위주로', '빵은 통밀로', '달지 않게', '매운 건 빼 줘'];

const FULL_TEXT = `요청은 ${MAX_REQUESTS}개까지 기억해요. 하나를 지우면 새로 적을 수 있어요.`;
const NAME_ONLY_NOTE = '빼 달라는 재료는 메뉴 이름으로만 확인해요. 알레르기가 있다면 매장에서 한 번 더 확인해 주세요.';

/** 태그 칩 (보기 전용 · onRemove 가 있으면 x) */
function TagChip({ tag, onRemove }: { tag: PrefTag; onRemove?: () => void }) {
  const label = prefTagLabel(tag);
  return (
    <View style={[styles.tag, tag.kind === 'avoid' && styles.tagAvoid]} accessibilityLabel={label}>
      <Text variant="captionMedium" color={tag.kind === 'avoid' ? 'ink2' : 'primaryText'}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 빼기`} hitSlop={10} onPress={onRemove} style={styles.tagX}>
          <Ionicons name="close" size={14} color={colors.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 밀리 탭 히어로 아래 — "밀리에게 요청하기" + 지금 기억하는 요청 칩 + 요청 n/5 */
export function MillyRequestEntry({ onPress }: { onPress: () => void }) {
  const items = usePreferences((s) => s.items);
  useEffect(ensurePreferencesLoaded, []);
  const tags = items.flatMap((r) => r.tags);
  const shown = tags.slice(0, 3);
  const more = tags.length - shown.length;
  return (
    <Card
      tone="section"
      padding={spacing.md}
      onPress={onPress}
      style={styles.entry}
      accessibilityLabel={`밀리에게 요청하기. 요청 ${items.length}/${MAX_REQUESTS}${tags.length ? `: ${tags.map(prefTagLabel).join(', ')}` : ''}. 누르면 요청을 적거나 지울 수 있어요`}
    >
      <View style={styles.entryHead}>
        <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.primaryText} />
        <Text variant="captionMedium" style={styles.flex}>
          밀리에게 요청하기
        </Text>
        <Text variant="small" color="ink3">
          요청 {items.length}/{MAX_REQUESTS}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </View>
      {shown.length ? (
        <View style={styles.chips}>
          {shown.map((t) => (
            <TagChip key={prefTagKey(t)} tag={t} />
          ))}
          {more > 0 ? (
            <Text variant="small" color="ink3" style={styles.more}>
              +{more}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text variant="small" color="ink3" style={styles.entrySub}>
          "아침엔 샐러드 위주로"처럼 적어 주시면 기억해 둘게요
        </Text>
      )}
    </Card>
  );
}

type Stage = { kind: 'edit' } | { kind: 'parsing' } | { kind: 'preview'; text: string; tags: PrefTag[]; source: AssistantRequest['source'] } | { kind: 'unknown' };

/** 요청 목록·적기·확인 시트 */
export function MillyRequestSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items = usePreferences((s) => s.items);
  const add = usePreferences((s) => s.add);
  const remove = usePreferences((s) => s.remove);
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'edit' });
  const [notice, setNotice] = useState<string | null>(null);
  const baseText = useRef('');
  const full = items.length >= MAX_REQUESTS;

  useEffect(ensurePreferencesLoaded, []);
  useEffect(() => {
    if (!visible) {
      setStage({ kind: 'edit' });
      setNotice(null);
    }
  }, [visible]);

  const submitRef = useRef<(t: string) => void>(() => undefined);
  const speech = useSpeechInput({
    onText: (t) => setText((baseText.current ? `${baseText.current} ${t}` : t).slice(0, REQUEST_MAX_LENGTH)),
    onEnd: (t) => {
      const all = baseText.current ? `${baseText.current} ${t}`.trim() : t;
      if (all) submitRef.current(all);
    },
  });

  const submit = async (value = text) => {
    const body = value.trim();
    if (!body || full) return;
    setNotice(null);
    setStage({ kind: 'parsing' });
    const r = await parseRequest(body);
    setStage(r.tags.length ? { kind: 'preview', text: body, tags: r.tags, source: r.source } : { kind: 'unknown' });
  };
  submitRef.current = (t) => void submit(t);

  const save = async () => {
    if (stage.kind !== 'preview' || !stage.tags.length) return;
    const r = await add({ text: stage.text, tags: stage.tags, source: stage.source });
    if (r.ok) {
      setText('');
      setStage({ kind: 'edit' });
      setNotice('기억해 둘게요. 다음 식단부터 챙길게요.');
    } else {
      setStage({ kind: 'edit' });
      setNotice(r.reason === 'full' ? FULL_TEXT : r.reason === 'duplicate' ? '이미 같은 요청을 기억하고 있어요.' : '어떤 부탁인지 잘 모르겠어요.');
    }
  };

  const showNameNote =
    items.some((r) => r.tags.some((t) => t.kind === 'avoid' && t.target.type === 'keyword')) ||
    (stage.kind === 'preview' && stage.tags.some((t) => t.kind === 'avoid' && t.target.type === 'keyword'));

  let footer;
  if (stage.kind === 'preview') {
    footer = (
      <View style={styles.footerRow}>
        <Button title="다시 적기" variant="outline" height={48} onPress={() => setStage({ kind: 'edit' })} style={styles.flex} />
        <Button title="이렇게 기억하기" height={48} disabled={!stage.tags.length} onPress={() => void save()} style={styles.flex2} />
      </View>
    );
  } else if (!full) {
    footer = <Button title="밀리에게 부탁하기" height={48} loading={stage.kind === 'parsing'} disabled={!text.trim() || speech.listening} onPress={() => void submit()} />;
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="밀리에게 요청하기" subtitle={`적어 주신 요청을 기억해 식단을 짤 때 챙길게요 · 요청 ${items.length}/${MAX_REQUESTS}`} footer={footer}>
      {items.length ? (
        <View style={styles.list}>
          {items.map((r) => (
            <View key={r.id} style={styles.item}>
              <View style={styles.flex}>
                <Text variant="caption" color="ink2" numberOfLines={2}>
                  {r.text}
                </Text>
                <View style={styles.chips}>
                  {r.tags.map((t) => (
                    <TagChip key={prefTagKey(t)} tag={t} />
                  ))}
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`"${r.text}" 요청 지우기`} hitSlop={8} onPress={() => void remove(r.id)} style={({ pressed }) => [styles.del, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={18} color={colors.ink3} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {stage.kind === 'preview' ? (
        <View style={styles.preview}>
          <View style={styles.previewHead}>
            <Ionicons name="sparkles-outline" size={15} color={colors.primaryText} />
            <Text variant="captionMedium" color="primaryText">
              이렇게 기억할게요
            </Text>
          </View>
          <Text variant="caption" color="ink2">
            "{stage.text}"
          </Text>
          <View style={styles.chips}>
            {stage.tags.map((t) => (
              <TagChip key={prefTagKey(t)} tag={t} onRemove={() => setStage((s) => (s.kind === 'preview' ? { ...s, tags: s.tags.filter((x) => x !== t) } : s))} />
            ))}
          </View>
          {!stage.tags.length ? (
            <Text variant="small" color="ink3">
              남은 요청이 없어요. 다시 적어 주세요.
            </Text>
          ) : (
            <Text variant="small" color="ink3">
              맞지 않는 건 x로 빼 주세요.
            </Text>
          )}
        </View>
      ) : full ? (
        <View style={styles.fullBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.ink3} />
          <Text variant="caption" color="ink2" style={styles.flex}>
            {FULL_TEXT}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.inputBox}>
            <TextInput
              accessibilityLabel="밀리에게 할 요청"
              value={text}
              onChangeText={(t) => {
                setText(t.slice(0, REQUEST_MAX_LENGTH));
                if (stage.kind === 'unknown') setStage({ kind: 'edit' });
              }}
              placeholder="예: 아침엔 웬만하면 샐러드 위주로"
              placeholderTextColor={colors.ink3}
              maxLength={REQUEST_MAX_LENGTH}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              editable={stage.kind !== 'parsing'}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={speech.listening ? '그만 듣기' : '말로 요청하기'}
              hitSlop={6}
              onPress={() => {
                if (speech.listening) speech.stop();
                else {
                  baseText.current = text.trim();
                  void speech.start();
                }
              }}
              style={({ pressed }) => [styles.mic, speech.listening && styles.micOn, pressed && styles.pressed]}
            >
              <Ionicons name={speech.listening ? 'stop' : 'mic-outline'} size={18} color={speech.listening ? colors.inkOnPrimary : colors.ink2} />
            </Pressable>
          </View>
          {speech.error ? (
            <Text variant="small" color="notice" style={styles.hint}>
              {SPEECH_ERROR_TEXT[speech.error]}
              {speechErrorNeedsSettings(speech.error) ? (
                <Text variant="small" color="primaryText" onPress={() => void Linking.openSettings()}>
                  {'  '}설정 열기
                </Text>
              ) : null}
            </Text>
          ) : null}
          {stage.kind === 'parsing' ? (
            <View style={styles.parsing}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="small" color="ink3">
                밀리가 알아듣는 중이에요
              </Text>
            </View>
          ) : null}
          {stage.kind === 'unknown' ? (
            <Text variant="caption" color="ink2" style={styles.hint}>
              어떤 부탁인지 잘 모르겠어요. 끼니·음식·맛으로 적어 주시면 알아들을 수 있어요.
            </Text>
          ) : null}
          <Text variant="small" color="ink3" style={styles.exTitle}>
            이렇게 적어 보세요
          </Text>
          <View style={styles.chips}>
            {REQUEST_EXAMPLES.map((ex) => (
              <Chip
                key={ex}
                label={ex}
                variant="soft"
                size="sm"
                onPress={() => {
                  setText(ex);
                  setStage({ kind: 'edit' });
                }}
              />
            ))}
          </View>
        </>
      )}

      {notice ? (
        <Text variant="small" color="primaryText" style={styles.hint}>
          {notice}
        </Text>
      ) : null}
      {showNameNote ? (
        <Text variant="small" color="ink3" style={styles.hint}>
          {NAME_ONLY_NOTE}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flex2: { flex: 2 },
  entry: { marginTop: spacing.sm, borderRadius: radius.lg, gap: spacing.xs + 2 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entrySub: { marginLeft: 23 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: spacing.xs + 2 },
  more: { marginLeft: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  tagAvoid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tagX: { marginLeft: 4 },
  list: { gap: spacing.sm, marginBottom: spacing.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  del: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  preview: { gap: spacing.xs + 2, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.section },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fullBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.section },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingLeft: spacing.md + 2, paddingRight: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.section },
  input: { ...type.body, flex: 1, color: colors.ink, paddingVertical: spacing.sm, outlineStyle: 'none' } as never,
  mic: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  micOn: { backgroundColor: colors.primary },
  hint: { marginTop: spacing.sm },
  parsing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  exTitle: { marginTop: spacing.md },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
});
