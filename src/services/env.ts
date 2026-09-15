/** .env(EXPO_PUBLIC_*) 읽기. 비어 있으면 undefined → 각 서비스가 로컬 폴백으로 동작 */
const read = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim() : undefined);

export const env = {
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  kakaoRestKey: read(process.env.EXPO_PUBLIC_KAKAO_REST_KEY),
  anthropicApiKey: read(process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY),
} as const;

export const hasSupabase = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasKakao = () => Boolean(env.kakaoRestKey);
export const hasAI = () => Boolean(env.anthropicApiKey);
