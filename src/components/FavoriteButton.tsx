import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { getMenu } from '@/data';
import type { MenuItem } from '@/domain/types';
import { ensureFavoritesLoaded, useFavorites, useIsFavorite } from '@/state/favorites';
import { colors, size as sizes } from '@/theme';

import { showToast } from './Toast';

/**
 * 자주 먹는 메뉴(즐겨찾기) 담기/빼기 — 메뉴 상세와 같은 규칙.
 * 앱 번들에 없는 메뉴(서버 검색 제품)는 다음 실행에도 열 수 있게 메뉴 전체를 스냅샷으로 적어 둔다.
 * 결과(담김=true)를 돌려준다.
 */
export async function toggleFavoriteMenu(menu: MenuItem, storeName?: string, opts: { toast?: boolean } = {}): Promise<boolean> {
  const snapshot = getMenu(menu.id) ? undefined : menu;
  const on = await useFavorites.getState().toggle({ menuId: menu.id, name: menu.name, storeName: storeName || undefined, menu: snapshot });
  if (opts.toast !== false) showToast(on ? '자주 먹는 메뉴에 담았어요' : '자주 먹는 메뉴에서 뺐어요', on ? 'success' : 'info');
  return on;
}

export interface FavoriteButtonProps {
  menu: MenuItem;
  /** 즐겨찾기 목록에 같이 적어 둘 매장·브랜드 이름 */
  storeName?: string;
  /** 하트 크기 (기본 22) */
  iconSize?: number;
  /** 보이는 버튼 크기 — 44 보다 작으면 hitSlop 으로 터치 영역을 44 로 맞춘다 (기본 44) */
  box?: number;
  style?: StyleProp<ViewStyle>;
}

/** 하트 토글 — 담기 전 테두리 하트, 담으면 채운 하트(primary). 터치 영역 44 */
export function FavoriteButton({ menu, storeName, iconSize = 22, box = sizes.touch, style }: FavoriteButtonProps) {
  const on = useIsFavorite(menu.id);
  useEffect(ensureFavoritesLoaded, []);
  const slop = Math.max(0, Math.ceil((sizes.touch - box) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `${menu.name} 자주 먹는 메뉴에서 빼기` : `${menu.name} 자주 먹는 메뉴에 담기`}
      hitSlop={slop}
      onPress={() => void toggleFavoriteMenu(menu, storeName)}
      style={({ pressed }) => [styles.btn, { width: box, height: box }, pressed && styles.pressed, style]}
    >
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={iconSize} color={on ? colors.primary : colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
