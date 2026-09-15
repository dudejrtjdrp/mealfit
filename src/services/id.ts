import * as Crypto from 'expo-crypto';

/** 고유 ID — expo-crypto randomUUID, 안 되면 Math.random 기반 v4 형식 */
export function newId(): string {
  try {
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && id.length > 0) return id;
  } catch {
    // 폴백
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
