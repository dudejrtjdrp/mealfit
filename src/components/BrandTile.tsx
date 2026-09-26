import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getBrand } from '@/data';
import { foodImageKey, storeImageKey } from '@/data/foodImageRules';
import { FOOD_IMAGES } from '@/data/generated/foodImages';
import type { MenuCategory, MenuItem, StoreCategory } from '@/domain/types';
import { colors, fonts } from '@/theme';

import { CupIcon } from './icons';
import { Text } from './Text';

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

/** 브랜드 이니셜 (로고를 흉내 내지 않고 글자만) */
const INITIAL: Record<string, string> = {
  gs25: 'GS',
  cu: 'CU',
  seven_eleven: '7E',
  starbucks: 'SB',
  mega: 'MG',
  ediya: 'ED',
  compose: 'CP',
  subway: 'SW',
  salady: 'SL',
  paris_baguette: 'PB',
  bonjuk: '죽',
  mom_touch: 'MT',
};

const CATEGORY_ICON: Record<StoreCategory, MciName> = {
  convenience: 'store-outline',
  cafe: 'coffee-outline',
  salad: 'leaf',
  korean: 'rice',
  bakery: 'baguette',
  fastfood: 'hamburger',
  other: 'silverware-fork-knife',
};

export interface BrandTileProps {
  brandId?: string;
  /** 브랜드를 모를 때 쓰는 카테고리 아이콘 */
  category?: StoreCategory;
  /** 매장 이름·카카오 분류 — 더 알맞은 매장 이미지(치킨집·국밥집 등)를 고르는 단서 */
  name?: string;
  placeCategory?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** 매장 사진 — 매장 종류별 AI 대표 이미지(실제 매장 사진 아님). 이미지가 없으면 회색 원 + 브랜드 이니셜/카테고리 아이콘 */
export function BrandTile({ brandId, category = 'other', name, placeCategory, size = 48, style }: BrandTileProps) {
  const brand = brandId ? getBrand(brandId) : undefined;
  const image = FOOD_IMAGES[storeImageKey({ category: brand?.category ?? category, brandName: brand?.name, name, placeCategory })];
  const initial = brandId ? (INITIAL[brandId] ?? brand?.name.slice(0, 2)) : undefined;
  const fontSize = initial && initial.length >= 2 ? size * 0.3 : size * 0.38;
  return (
    <View
      accessibilityLabel={brandId ? `${brand?.name ?? ''} 타일` : '매장 타일'}
      style={[styles.tile, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      {image ? (
        <Image source={image} style={{ width: size, height: size }} contentFit="cover" transition={120} />
      ) : initial ? (
        <Text style={{ fontFamily: fonts.bold, fontSize, lineHeight: Math.round(fontSize * 1.2), color: colors.ink2 }} numberOfLines={1}>
          {initial}
        </Text>
      ) : (
        <MaterialCommunityIcons name={CATEGORY_ICON[category]} size={Math.round(size * 0.46)} color={colors.ink2} />
      )}
    </View>
  );
}

/** 메뉴 이름·카테고리로 고르는 아이콘 — 'cup' 은 시안의 테이크아웃 컵 SVG */
export function menuIconName(menu: Pick<MenuItem, 'name' | 'category'>): MciName | 'cup' {
  const n = menu.name;
  if (menu.category === 'drink') {
    if (/티|차$|녹차|말차/.test(n)) return 'tea-outline';
    if (/우유|두유|요거트|프로틴/.test(n)) return 'cup-water';
    if (/주스|에이드|스무디|프라푸치노|콜라|사이다|탄산|음료|워터|물$|버블|펄|아이스|콜드/.test(n)) return 'cup';
    return 'coffee-outline';
  }
  if (/샐러드/.test(n)) return 'leaf';
  if (/요거트|그래놀라|볼$|죽/.test(n)) return 'bowl-mix-outline';
  if (/샌드위치|써브|서브|토스트/.test(n)) return 'bread-slice-outline';
  if (/버거/.test(n)) return 'hamburger';
  if (/치킨|너겟|텐더|닭가슴살/.test(n)) return 'food-drumstick-outline';
  if (/도시락|정식/.test(n)) return 'food-takeout-box-outline';
  if (/김밥|주먹밥|유부|밥/.test(n)) return 'rice';
  if (/면|파스타|라면|우동/.test(n)) return 'noodles';
  if (/랩|부리또/.test(n)) return 'taco';
  if (/케이크|케익/.test(n)) return 'cake-variant-outline';
  if (/쿠키/.test(n)) return 'cookie-outline';
  if (/크루아상/.test(n)) return 'food-croissant';
  if (/베이글|빵|머핀|스콘|브레드/.test(n)) return 'baguette';
  if (/계란|달걀|에그/.test(n)) return 'egg-outline';
  if (/바나나|과일|사과/.test(n)) return 'food-apple-outline';
  if (/감자|프라이/.test(n)) return 'french-fries';
  const byCat: Record<MenuCategory, MciName> = { drink: 'coffee-outline', meal: 'food-outline', snack: 'cookie-outline', salad: 'leaf', side: 'egg-outline' };
  return byCat[menu.category];
}

/** 이 메뉴에 AI 대표 이미지가 있는지 (상세 화면의 'AI 예시' 안내용) */
export function hasMenuImage(menu: Pick<MenuItem, 'name' | 'category'>): boolean {
  return FOOD_IMAGES[foodImageKey(menu)] != null;
}

export interface MenuTileProps {
  menu: Pick<MenuItem, 'name' | 'category'>;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** 메뉴 사진 — 음식 종류별 AI 대표 이미지(그 메뉴의 실제 사진 아님). 이미지가 없으면 회색 원 + 스트로크 아이콘 (시안 D3) */
export function MenuTile({ menu, size = 48, style }: MenuTileProps) {
  const image = FOOD_IMAGES[foodImageKey(menu)];
  const name = menuIconName(menu);
  const iconSize = Math.round(size * 0.46);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {image ? (
        <Image source={image} style={{ width: size, height: size }} contentFit="cover" transition={120} />
      ) : name === 'cup' ? (
        <CupIcon size={iconSize} color={colors.ink2} />
      ) : (
        <MaterialCommunityIcons name={name} size={iconSize} color={colors.ink2} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.line },
});
