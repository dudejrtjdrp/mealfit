import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * 음식 사진 찍기·고르기 → AI 로 보낼 작은 JPEG(긴 변 768px, 품질 0.6).
 * 사진은 기기·서버 어디에도 저장하지 않고 분석에만 쓴다.
 */
export type MealPhoto = { ok: true; uri: string; base64: string } | { ok: false; reason: 'canceled' | 'denied' | 'failed' };

const MAX_SIDE = 768;

export async function pickMealPhoto(from: 'camera' | 'library'): Promise<MealPhoto> {
  try {
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.canceled ? undefined : res.assets?.[0];
    if (!asset) return { ok: false, reason: 'canceled' };
    const ctx = ImageManipulator.manipulate(asset.uri);
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    if (Math.max(w, h) > MAX_SIDE) ctx.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
    if (!out.base64) return { ok: false, reason: 'failed' };
    return { ok: true, uri: out.uri, base64: out.base64.replace(/^data:image\/\w+;base64,/, '') };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
