/** .env(EXPO_PUBLIC_*) 읽기. 비어 있으면 undefined → 각 서비스가 로컬 폴백으로 동작 */
const read = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim() : undefined);

export type LLMProvider = 'anthropic' | 'openai';

const provider = read(process.env.EXPO_PUBLIC_LLM_PROVIDER)?.toLowerCase();

export const env = {
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  kakaoRestKey: read(process.env.EXPO_PUBLIC_KAKAO_REST_KEY),
  /** 'anthropic' | 'openai'(OpenAI 호환: DeepSeek·Qwen 등). 비우면 anthropic */
  llmProvider: (provider === 'openai' ? 'openai' : 'anthropic') as LLMProvider,
  llmApiKey: read(process.env.EXPO_PUBLIC_LLM_API_KEY),
  llmModel: read(process.env.EXPO_PUBLIC_LLM_MODEL),
  /** openai 호환 엔드포인트 기본 주소 (예: https://api.deepseek.com/v1) */
  llmBaseUrl: read(process.env.EXPO_PUBLIC_LLM_BASE_URL),
} as const;

export const hasSupabase = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasKakao = () => Boolean(env.kakaoRestKey);
export const hasLLM = () => Boolean(env.llmApiKey);
/** @deprecated hasLLM 과 같음 (이전 이름 호환) */
export const hasAI = hasLLM;
