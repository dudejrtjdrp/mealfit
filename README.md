# Mealing (코드명 mealfit) — 식사 개인화 앱

건강관리 목적과 식단 성향에 맞춰, 지금 내 주변 매장의 메뉴를 먹기 전에 "좋음 · 괜찮음 · 오늘은 패스"로 판정해 보여 주는 iOS 앱. 창업공모전 출품작이며 진행 중인 MVP다.

2026.09.15 ~ (진행 중) · 창업공모전 팀 프로젝트, 앱 설계·개발 1인(기획서는 팀원 작성) · Expo SDK 57(React Native) · TypeScript · expo-router · zustand · Supabase(Auth·Postgres·RLS) · 카카오 로컬 API · 식약처 영양성분 공공데이터 · Jest · TestFlight 내부 테스트 중

## 왜 만들었나

식단을 관리하는 사람도 외식이나 편의점 앞에서는 "이걸 먹어도 되나"를 매번 직접 계산해야 한다. 기존 식단 앱은 대부분 먹은 뒤에 기록하는 도구다.
Mealing은 순서를 바꿔, 오늘 남은 목표량을 기준으로 주변 매장 메뉴를 먼저 판정하고 사이즈·시럽 같은 옵션을 바꾸면 결과가 어떻게 달라지는지까지 보여 준다. 문구는 금지 대신 허용의 언어("842 kcal 남음", "오늘은 여기까지, 내일 다시 채워져요")로 쓴다.

## 주요 기능

- **대화형 온보딩**: 캐릭터 '밀리'가 신체 정보, 활동량, 목적(체중 감량·유지·증량, 혈당, 콜레스테롤, 저속노화), 식단 습관 서술을 묻고 오늘 목표량을 계산한다
- **식단 성향 분류**: 서술을 식단 유형 하나와 근거 3개로 정리한다. 기본은 규칙 기반이고, API 키가 있을 때만 LLM을 부른다
- **주변 매장 판정**: GPS와 카카오 로컬 API로 주변 매장을 찾고 브랜드 메뉴를 3단계로 판정한다. 위치는 지도 가운데 핀으로 바꿀 수 있다
- **메뉴 상세·구매 가이드**: 옵션 칩을 바꾸면 즉시 다시 판정하고, 한 단계 좋아지는 옵션이 있으면 "시럽 빼면 좋음이 돼요"처럼 알려 준다
- **기록**: 매장 메뉴, 시판 가공식품 검색, 직접 입력으로 기록하고 하루 요약과 여유분 게이지를 갱신한다
- **로그인·동기화**: 이메일, Apple(iOS 네이티브), Google·카카오(Supabase OAuth). 키가 없으면 전부 기기 저장으로 동작한다

## 기술적으로 고민한 것

**1. 판정 엔진을 규칙으로, 그리고 테스트로 고정**
문제: 처음 규칙(계단식 가산)으로는 시드 메뉴가 거의 전부 "좋음"이 나와서 판정이 의미가 없었다.
선택: 점수를 연속 곡선으로 바꿨다. 칼로리 점수(메뉴 kcal ÷ 남은 kcal, 30% 이하 100점부터 60% 초과 0점까지) × 0.7에 목적별 강조 영양소 점수 × 0.3을 더한다. 음료는 80 kcal 이상이면 "괜찮음"까지만 받게 상한을 두고(단백질 12 g 이상은 예외), 30 kcal 미만은 85점 상한을 둬서 식사보다 위에 서지 않게 했다. 영양 정보가 없는 메뉴는 0으로 채우지 않고 판정 자체를 하지 않는다.
결과: 시드 데이터 전체의 판정 분포가 고르게 나오는지 보는 회귀 테스트를 만들고, 기준값은 그 테스트를 통과하는 최소 조정값으로 정했다 (`src/domain/judge.ts`, `src/domain/__tests__/judgeDistribution.test.ts`).

**2. 같은 서술로 AI를 두 번 부르지 않기**
문제: 성향 분류에 LLM을 쓰면 사용자마다, 재가입할 때마다 토큰이 든다.
선택: 캐시 → LLM → 규칙 순으로 처리한다. 캐시 키는 정규화한 서술과 프롬프트 버전의 SHA-256이고, 원문은 저장하지 않는다. 캐시는 Supabase `diet_type_cache` 테이블에 두어 모든 사용자가 공유한다. 캐시를 읽을 수 없으면 LLM도 부르지 않고 규칙으로 간다. LLM 응답이 유효한 JSON 유형이 아니면 규칙 결과를 쓴다. 제공자는 Anthropic 또는 OpenAI 호환 엔드포인트 중에 고를 수 있다.
결과: 같은 서술은 누가 입력해도 AI를 다시 부르지 않고, 키가 없거나 실패해도 결과 화면이 항상 나온다 (`src/services/ai/classifyDiet.ts`, `src/services/ai/llm.ts`).

**3. 공공데이터 수십만 건을 앱에 싣는 방법**
문제: 시드 메뉴 158개 중 공식 영양표로 확인한 것은 2개뿐이었다. 식약처 가공식품 데이터는 포털 다운로드가 5만 행으로 잘려서 라면·과자가 검색되지 않았다.
선택: 인제스트 스크립트로 식약처 전국통합 영양성분 데이터를 브랜드별로 변환해 앱에 번들했다(메뉴 10,594개, 전부 공식 등급과 출처 포함). 가공식품은 전체 59만 행을 API로 다시 모아 유일 제품 약 26만 개를 Supabase `products` 테이블(pg_trgm 부분 일치 인덱스)에 넣었다. 앱에는 분류별 정원을 둔 3.7만 개만 오프라인 폴백으로 넣었다. 검색은 로컬 결과를 즉시 보여 주고, 서버 결과를 250 ms 디바운스로 합친다.
결과: 4 MB가 넘는 번들 때문에 로그인 화면이 늦게 뜨는 문제는 카탈로그를 처음 접근할 때 만들고, 앱 시작 직후 여유가 있을 때 미리 데우는 방식으로 풀었다 (`scripts/ingest-nutrition.mjs`, `src/data/index.ts`, `src/services/products.ts`, `supabase/migrations/0002_products.sql`).

**4. 키 없이도 끝까지 동작하는 저장소 계층**
문제: 외부 키(Supabase, 카카오, LLM)가 준비되기 전에 전체 흐름을 완성해야 했다.
선택: 저장소를 인터페이스로 두고 `local`(AsyncStorage)과 `supabase` 구현을 나눴다. 첫 로그인 때 로컬 프로필과 기록을 서버로 한 번 옮기고, 원본은 백업으로 남긴다. 카카오 키가 없으면 목 매장을 현재 위치 주변에 배치한다 (`src/services/repo/`).

## 구조

```
src/
├─ app/          expo-router 라우트 — (onboarding) · (tabs) 오늘·주변·기록·마이 · store/[id] · menu/[id] · log/add · my/*
├─ domain/       순수 로직(React 의존 없음) — targets 목표량 · judge 판정 · diet 성향 규칙 · summary
├─ data/         시드 메뉴·브랜드, generated/ 식약처 번들, ingest/ 변환 규칙
├─ services/     supabase · auth · kakao · location · ai/ · repo/(local·supabase·migrate)
├─ state/        zustand 스토어 — session · profile · day · nearby · onboarding
└─ components/   공통 UI(판정 배지, 게이지, 바텀시트 등)
supabase/migrations/  0001_init(profiles·meal_logs·diet_type_cache, RLS) · 0002_products
scripts/         ingest-nutrition · testflight · release(버전·패치노트 자동화)
docs/IA.md       정보구조도, 화면 ID(A1~F5)
```

화면 ID(A1~F5)를 라우트와 컴포넌트 이름에 그대로 써서, 시안과 코드가 같은 이름을 보게 했다.

## 실행 방법

사전 준비: Node.js 20 이상, iOS 개발 빌드에는 Xcode

```bash
npm install
cp .env.example .env         # 비워 둬도 로컬 폴백으로 동작
npx expo start               # Expo Go / 웹(w 키)
npx expo run:ios             # iOS 개발 빌드 (소셜 로그인 확인은 이쪽에서)
```

환경변수 이름(`.env.example` 참고): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_KAKAO_REST_KEY`, `EXPO_PUBLIC_LLM_PROVIDER`, `EXPO_PUBLIC_LLM_API_KEY`, `EXPO_PUBLIC_LLM_MODEL`, `EXPO_PUBLIC_LLM_BASE_URL`. 모두 선택이다. `EXPO_PUBLIC_*` 값은 앱 번들에 들어가므로, LLM 키를 앱에 넣는 것은 데모용이다.

Supabase를 쓰려면 `supabase/migrations/`의 SQL을 순서대로 실행하고 Email 로그인을 켠다.

검증: `npm run typecheck` · `npm test`(Jest 19개 파일, 도메인·데이터·저장소·스토어) · `npm run export:web`

## 알려진 제한

- 결제와 AI 종합 피드백(F5)은 미리보기 카드만 있다.
- 탈퇴하면 데이터만 지운다. `auth.users` 계정 삭제에는 서버 함수가 필요하다.
- 오프라인에서 저장이 실패해도 다시 시도하지 않는다.
- 메뉴·매장 사진은 저작권 때문에 넣지 않았다.

글꼴: Pretendard — © Kil Hyung-jin, SIL Open Font License 1.1
