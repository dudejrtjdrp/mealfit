import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Screen, StackHeader, Text } from '@/components';
import { colors, radius, spacing } from '@/theme';

import { DRAFT_NOTICE, type LegalDoc } from './content';

/** F4 약관 페이지 공통 틀 — 초안 표시 · 머리말 · 섹션별 문단 (스크롤) */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <Screen scroll header={<StackHeader title={doc.title} />}>
      <View style={styles.draft} accessibilityRole="text">
        <Ionicons name="document-text-outline" size={16} color={colors.ok} />
        <Text variant="captionMedium" color="ok" style={styles.flex}>
          {DRAFT_NOTICE}
        </Text>
      </View>
      <Text variant="body" color="ink2" style={styles.intro}>
        {doc.intro}
      </Text>
      {doc.sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text variant="h3" accessibilityRole="header">
            {s.title}
          </Text>
          {s.body.map((p, i) =>
            p.startsWith('· ') ? (
              <View key={i} style={styles.bullet}>
                <Text variant="caption" color="ink3">
                  ·
                </Text>
                <Text variant="caption" color="ink2" style={styles.flex} selectable>
                  {p.slice(2)}
                </Text>
              </View>
            ) : (
              <Text key={i} variant="caption" color="ink2" style={styles.para} selectable>
                {p}
              </Text>
            ),
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  draft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, backgroundColor: colors.okBg, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  flex: { flex: 1 },
  intro: { marginTop: spacing.lg },
  section: { marginTop: spacing.xl, gap: spacing.sm },
  para: {},
  bullet: { flexDirection: 'row', gap: spacing.xs },
});
