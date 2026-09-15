import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getBrand } from '@/data';
import type { MenuCategory, MenuItem, StoreCategory } from '@/domain/types';
import { brandColors, fonts, menuTileColors, radius } from '@/theme';

import { Text } from './Text';

/** 브랜드 이니셜 (로고 대신) */
const INITIAL: Record<string, string> = {
  gs25: 'GS25',
  cu: 'CU',
  seven_eleven: '7',
  starbucks: '★',
  mega: 'MGC',
  ediya: 'E',
  compose: 'C',
  subway: 'S',
  salady: '🥗',
  paris_baguette: 'P',
  bonjuk: '죽',
  mom_touch: 'M',
};

const CATEGORY_EMOJI: Record<StoreCategory, string> = {
  convenience: '🏪',
  cafe: '☕',
  salad: '🥗',
  korean: '🍚',
  bakery: '🥐',
  fastfood: '🍔',
  other: '🍴',
};

export interface BrandTileProps {
  brandId?: string;
  /** 브랜드를 모를 때 쓰는 카테고리 이모지 */
  category?: StoreCategory;
  size?: number;
  /** 원형(D3 헤더) / 라운드 사각(D1 카드) */
  shape?: 'rounded' | 'circle';
  style?: StyleProp<ViewStyle>;
}

/** 매장 사진 자리 — 브랜드색 연한 바탕 + 이니셜 */
export function BrandTile({ brandId, category = 'other', size = 96, shape = 'rounded', style }: BrandTileProps) {
  const c = (brandId && brandColors[brandId]) || brandColors._default;
  const initial = brandId ? INITIAL[brandId] ?? getBrand(brandId)?.name.slice(0, 1) : undefined;
  const label = initial ?? CATEGORY_EMOJI[category];
  const isEmoji = /\p{Extended_Pictographic}/u.test(label);
  const fontSize = isEmoji ? size * 0.42 : label.length >= 4 ? size * 0.24 : label.length === 3 ? size * 0.28 : label.length === 2 ? size * 0.34 : size * 0.44;
  return (
    <View
      accessibilityLabel={brandId ? `${getBrand(brandId)?.name ?? ''} 타일` : '매장 타일'}
      style={[styles.tile, { width: size, height: size, borderRadius: shape === 'circle' ? size / 2 : Math.round(size * 0.2), backgroundColor: c.bg }, style]}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize, lineHeight: fontSize * 1.2, color: c.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 메뉴 이름·카테고리로 고르는 이모지 */
export function menuEmoji(menu: Pick<MenuItem, 'name' | 'category'>): string {
  const n = menu.name;
  if (menu.category === 'drink') {
    if (/티|차$|녹차|말차/.test(n)) return '🍵';
    if (/주스|에이드|스무디|프라푸치노|콜라|사이다|탄산|음료|워터|물$/.test(n)) return '🥤';
    if (/우유|두유|요거트|프로틴/.test(n)) return '🥛';
    if (/버블|펄/.test(n)) return '🧋';
    if (/아이스|콜드/.test(n)) return '🥤';
    return '☕';
  }
  if (/샐러드/.test(n)) return '🥗';
  if (/요거트|그래놀라|볼$/.test(n)) return '🥣';
  if (/샌드위치|써브|서브|토스트/.test(n)) return '🥪';
  if (/버거/.test(n)) return '🍔';
  if (/치킨|너겟|텐더/.test(n)) return '🍗';
  if (/도시락|정식/.test(n)) return '🍱';
  if (/김밥|주먹밥|유부/.test(n)) return '🍙';
  if (/죽/.test(n)) return '🥣';
  if (/면|파스타|라면|우동/.test(n)) return '🍜';
  if (/랩|부리또/.test(n)) return '🌯';
  if (/케이크|케익/.test(n)) return '🍰';
  if (/쿠키/.test(n)) return '🍪';
  if (/베이글|빵|크루아상|머핀|스콘|브레드/.test(n)) return '🥐';
  if (/계란|달걀|에그/.test(n)) return '🥚';
  if (/바나나|과일|사과/.test(n)) return '🍌';
  if (/닭가슴살/.test(n)) return '🍗';
  if (/감자|프라이/.test(n)) return '🍟';
  const byCat: Record<MenuCategory, string> = { drink: '☕', meal: '🍱', snack: '🥐', salad: '🥗', side: '🥚' };
  return byCat[menu.category];
}

export interface MenuTileProps {
  menu: Pick<MenuItem, 'name' | 'category'>;
  size?: number;
  radiusSize?: number;
  style?: StyleProp<ViewStyle>;
}

/** 메뉴 사진 자리 — 카테고리 연한 바탕 + 이모지 */
export function MenuTile({ menu, size = 76, radiusSize, style }: MenuTileProps) {
  const fs = Math.round(size * 0.46);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radiusSize ?? Math.round(size * 0.18), backgroundColor: menuTileColors[menu.category] ?? menuTileColors.side },
        style,
      ]}
    >
      <Text style={{ fontSize: fs, lineHeight: Math.round(fs * 1.25) }}>{menuEmoji(menu)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radius.md },
});
