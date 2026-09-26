// assets/food/*.jpg → src/data/generated/foodImages.ts (require 맵). 이미지를 추가·교체한 뒤 `npm run food-images`.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = readdirSync(join(root, 'assets/food')).filter((f) => /\.(jpg|png|webp)$/.test(f)).sort();
const lines = [
  '// 자동 생성 파일 — scripts/food-images.mjs (assets/food 의 AI 대표 이미지)',
  '/* eslint-disable */',
  'export const FOOD_IMAGES: Record<string, number> = {',
  ...files.map((f) => `  ${JSON.stringify(f.replace(/\.\w+$/, ''))}: require('../../../assets/food/${f}'),`),
  '};',
  '',
];
writeFileSync(join(root, 'src/data/generated/foodImages.ts'), lines.join('\n'));
console.log(`foodImages.ts: ${files.length}개`);
