import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, StackHeader, Text, showToast } from '@/components';
import { colors, radius, spacing } from '@/theme';

/** F5 유료 기능 미리보기 — 잠금 카드 2장, 결제 없음 */
export default function Premium() {
  return (
    <Screen scroll header={<StackHeader title="프리미엄 미리보기" />}>
      <Text variant="h1" style={styles.title}>
        더 깊이 있는{'\n'}
        <Text variant="h1" color="primaryText">
          식습관 관리
        </Text>
      </Text>
      <Text variant="caption" color="ink3" style={styles.sub}>
        지금은 무료 기능만 열려 있어요. 출시되면 알려드릴게요.
      </Text>

      <LockCard
        icon={<Ionicons name="sparkles-outline" size={20} color={colors.ink2} />}
        title="AI 종합 피드백"
        desc="한 주의 기록을 돌아보고, 내 목적에 맞춘 식습관 피드백을 드려요."
        preview={['이번 주 단백질을 꾸준히 챙겼어요', '저녁 간식을 조금 가볍게 바꿔 볼까요?']}
      />
      <LockCard
        icon={<Ionicons name="calculator-outline" size={20} color={colors.ink2} />}
        title="커스텀 메뉴 계산 대행"
        desc="영양표가 없는 메뉴도 재료를 알려주시면 계산해 드려요."
        preview={['동네 김밥집 참치김밥 · 계산 요청', '회사 앞 샐러드 · 재료 사진 올리기']}
      />

      <Button title="출시되면 알려주세요" variant="tint" onPress={() => showToast('출시되면 알려드릴게요', 'info')} style={styles.cta} />
    </Screen>
  );
}

function LockCard({ icon, title, desc, preview }: { icon: ReactNode; title: string; desc: string; preview: string[] }) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>{icon}</View>
        <View style={styles.headText}>
          <Text variant="h3">{title}</Text>
          <Text variant="small" color="ink3">
            월 5,000원 · 출시 후 열려요
          </Text>
        </View>
        <Ionicons name="lock-closed" size={20} color={colors.ink3} />
      </View>
      <Text variant="caption" color="ink2" style={styles.desc}>
        {desc}
      </Text>
      <View style={styles.preview}>
        {preview.map((p) => (
          <View key={p} style={styles.previewRow}>
            <View style={styles.previewDot} />
            <Text variant="caption" color="ink3" style={styles.blur}>
              {p}
            </Text>
          </View>
        ))}
        <View style={styles.lockOverlay}>
          <Ionicons name="lock-closed" size={12} color={colors.ink2} />
          <Text variant="small" color="ink2">
            미리보기
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.lg },
  sub: { marginTop: spacing.xs },
  card: { marginTop: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, marginLeft: spacing.md },
  desc: { marginTop: spacing.md },
  preview: { marginTop: spacing.md, backgroundColor: colors.section, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, overflow: 'hidden' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, opacity: 0.45 },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  blur: {},
  lockOverlay: { position: 'absolute', right: spacing.md, top: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  cta: { marginTop: spacing.xl },
});
