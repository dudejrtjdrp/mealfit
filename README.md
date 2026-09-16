# mealfit — 식사 개인화 서비스 MVP

**내 건강관리 습관에 맞는 메뉴를, 지금 내 주변에서 먼저 판정해 보여주는 앱.** (창업공모전 출품작)

온보딩으로 신체정보·목적·식단 성향을 받고 → 오늘 목표량을 계산하고 → 주변 매장의 메뉴를 "좋음 · 괜찮음 · 오늘은 패스"로 판정해 → 옵션(사이즈·시럽 빼기 등)까지 반영한 구매 가이드를 주고 → 먹은 것을 기록합니다.

## 화면

시안은 [`docs/design/`](docs/design/) 에 있습니다. 정보구조와 화면 목록(A1~F5)은 [`docs/IA.md`](docs/IA.md).

| 로그인 | 식단 성향 결과 | 주변 매장 | 메뉴 상세 | 기록 |
| --- | --- | --- | --- | --- |
| [A2](docs/design/A2-login.png) | [B6](docs/design/B6-diet-result.png) | [D1](docs/design/D1-nearby.png) | [D4](docs/design/D4-menu-detail.png) | [E1](docs/design/E1-log.png) |

그 밖에 [B1 인트로](docs/design/B1-intro.png) · [B2 기본정보](docs/design/B2-basic-info.png) · [B5 식단 서술](docs/design/B5-diet-text.png) · [D3 매장 메뉴](docs/design/D3-store-menu.png) · [F1 마이](docs/design/F1-my.png).

## 실행 (맥)

```bash
npm install
cp .env.example .env        # 비워 둬도 전부 로컬 폴백으로 동작해요
npx expo run:ios            # iOS 시뮬레이터 개발 빌드 (Xcode 필요)
# 또는
npx expo start              # Expo Go / 웹(w 키)
```

- Node 20 이상, Expo SDK 57.
- 소셜 로그인(카카오·Apple·Google)은 딥링크(`mealfit://`)·네이티브 모듈이 필요해서 **개발 빌드(`expo run:ios`)** 에서 확인하세요. Expo Go 에서는 리다이렉트 주소가 `exp://…` 로 바뀝니다.
- `.env` 를 바꾸면 `npx expo start -c` 로 캐시를 비우고 다시 실행하세요 (`EXPO_PUBLIC_*` 는 번들 시점에 박힙니다).

## 환경 변수

`.env.example` 을 복사해 `.env` 로 씁니다. **어느 키도 필수가 아닙니다.** 비어 있으면 아래 폴백이 실제로 동작합니다.

| 변수 | 용도 | 비어 있을 때 |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (Settings → API) | 로그인은 닉네임 시트, 데이터는 이 기기 AsyncStorage 에 저장 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(public) 키 | 위와 같음 (URL·키 둘 다 있어야 Supabase 사용) |
| `EXPO_PUBLIC_KAKAO_REST_KEY` | 카카오 로컬 API REST 키 — 주변 매장 검색 | 역삼동 기준 목 매장 목록(시안과 같은 4곳 + α)을 현재 위치 주변에 배치 |
| `EXPO_PUBLIC_LLM_PROVIDER` | 식단 성향 AI 분류 제공자: `anthropic` \| `openai`(OpenAI 호환) | `anthropic` |
| `EXPO_PUBLIC_LLM_API_KEY` | 위 제공자의 API 키 | **규칙 기반 분류**(키워드·목적 규칙)로 B6 결과를 만듦 |
| `EXPO_PUBLIC_LLM_MODEL` | 모델 이름 | anthropic → `claude-haiku-4-5`, openai → `gpt-4o-mini` |
| `EXPO_PUBLIC_LLM_BASE_URL` | OpenAI 호환 엔드포인트 (DeepSeek·Qwen 등) | `https://api.openai.com/v1` |

> `EXPO_PUBLIC_*` 값은 앱 번들에 그대로 들어갑니다. Supabase anon 키는 RLS 로 보호되므로 괜찮지만, **LLM 키를 앱에 넣는 건 데모용**입니다. 출시 전에는 Supabase Edge Function 으로 옮기세요.

## Supabase 세팅

1. [supabase.com](https://supabase.com) 에서 새 프로젝트를 만듭니다 (리전: Northeast Asia (Seoul) 권장).
2. **SQL Editor → New query** 에 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 전체를 붙여넣고 **Run**. 테이블 3개와 RLS 정책이 만들어집니다.
3. **Settings → API** 에서 Project URL 과 `anon` `public` 키를 `.env` 에 넣습니다.
4. **Authentication → Sign In / Providers → Email** 을 켭니다.
   - 데모에서는 **Confirm email 을 끄면** 가입 즉시 로그인됩니다. 켜 두면 인증 메일의 링크를 누른 뒤 앱에서 로그인하면 됩니다.
5. (선택) 소셜 로그인 — 카카오 · Apple · Google
   - 공통: **Authentication → URL Configuration → Redirect URLs** 에 `mealfit://auth` 와 `mealfit://**` 를 추가합니다. (Expo Go 로 시험한다면 터미널에 찍히는 `exp://…/--/auth` 주소도)
   - **Apple (iOS 네이티브 Sign in with Apple)**
     - 앱은 `expo-apple-authentication` 으로 시스템 Apple 시트를 띄우고, 받은 `identityToken` 을 `supabase.auth.signInWithIdToken({ provider: 'apple' })` 로 넘깁니다. 브라우저를 거치지 않아 Apple 콘솔의 Services ID·Secret Key 는 필요 없습니다.
     - Supabase **Sign In / Providers → Apple** 을 켜고 **Client IDs** 에 번들 ID `app.mealfit.mvp` 를 넣습니다.
     - `app.json` 에 `ios.usesAppleSignIn: true` 와 `expo-apple-authentication` 플러그인이 들어 있어, `npx expo run:ios` 로 prebuild 하면 **Xcode 자동 서명이 Sign in with Apple capability 를 추가**합니다. (유료 Apple Developer 팀으로 서명해야 하고, 시뮬레이터에서는 iCloud 로그인이 필요)
     - 이름은 **첫 로그인 때만** 옵니다. 앱이 `user_metadata.nickname` 에 저장하고, 없으면 닉네임은 "회원". 이메일은 `…@privaterelay.appleid.com` 일 수 있습니다.
     - Android·웹에서는 Apple 버튼을 숨깁니다.
   - **Google (Supabase OAuth, 시스템 브라우저)**
     - Google Cloud Console → **API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션** 을 만들고, 승인된 리디렉션 URI 에 `https://<project-ref>.supabase.co/auth/v1/callback` 을 등록합니다. (OAuth 동의 화면도 먼저 구성)
     - 받은 클라이언트 ID·보안 비밀을 Supabase **Sign In / Providers → Google** 에 넣습니다.
     - 앱은 `WebBrowser.openAuthSessionAsync`(iOS ASWebAuthenticationSession / Android Custom Tabs)로 열어 구글의 임베디드 웹뷰 차단에 걸리지 않습니다. 콜백 `mealfit://auth?code=…` 와 `#access_token=…` 둘 다 처리합니다.
   - **카카오 (Supabase OAuth)**
     - 카카오 콘솔의 Redirect URI 에 `https://<project-ref>.supabase.co/auth/v1/callback` 을 등록하고, REST API 키·Client Secret 을 Supabase **Kakao** Provider 에 넣습니다.
     - Supabase 는 `account_email` 동의항목을 요청합니다. **비즈 앱으로 전환한 뒤 이메일 동의항목을 켜야** 로그인이 됩니다. 그 전에는 KOE205 오류가 나며, 앱은 "카카오 로그인은 준비 중이에요. 이메일로 시작해 주세요" 로 안내합니다.

### 테이블 요약

| 테이블 | 내용 | RLS |
| --- | --- | --- |
| `profiles` | 사용자 1명당 1행 (`id` = `auth.users.id`). 신체정보·목적·식단 성향(`diet` jsonb)·온보딩 완료 여부. `updated_at` 트리거 | 본인 행만 읽기·쓰기·삭제 |
| `meal_logs` | 식사 기록. 영양(`nutrients` jsonb)·신뢰등급·수량·판정. 인덱스 `(user_id, date)` | 본인 행만 |
| `diet_type_cache` | 식단 성향 AI 결과 캐시. `key` = sha256(정규화 서술 + 프롬프트 버전). **전 사용자 공유** — 같은 서술이면 누구든 AI 를 다시 부르지 않음. 원문은 저장 안 함 | 로그인 사용자 읽기·추가만 |

### 로그인 · 저장소 동작

| | Supabase 미설정 | Supabase 설정 |
| --- | --- | --- |
| 카카오 / Google | 닉네임 시트 → 이 기기에 세션 저장 | `signInWithOAuth` → 시스템 브라우저(`WebBrowser.openAuthSessionAsync`) → `mealfit://auth` 로 돌아와 세션 생성 |
| Apple (iOS 만) | 닉네임 시트 → 이 기기에 세션 저장 | 네이티브 Apple 시트 → `signInWithIdToken({ provider: 'apple' })` |
| 이메일 | 닉네임 + 이메일 시트 | **이메일 + 비밀번호(8자 이상)** 가입 / 로그인 |
| 데이터 저장 | AsyncStorage | Supabase (`profiles`, `meal_logs`, `diet_type_cache`) |
| 기존 로컬 데이터 | — | 첫 로그인 때 **로컬 프로필·기록을 Supabase 로 1회 옮김** (서버에 프로필이 이미 있으면 프로필은 덮어쓰지 않음, 로컬 원본은 백업으로 남김) |
| 로그아웃 | 이 기기의 프로필·세션 삭제 | `auth.signOut()` + 로컬 세션 정리 (서버 데이터는 유지) |
| 탈퇴 | 이 기기의 프로필·기록·세션 삭제 | 서버의 프로필·기록 삭제 후 로그아웃 |

설정 화면(F4)의 "데이터 저장 위치"는 실제로 쓰는 저장소(이 기기 / Supabase)를 보여줍니다.

## 카카오 로컬 API 키 발급

1. [developers.kakao.com](https://developers.kakao.com) → 내 애플리케이션 → 애플리케이션 추가
2. **앱 설정 → 앱 키 → REST API 키** 를 `EXPO_PUBLIC_KAKAO_REST_KEY` 에 넣습니다.
3. **제품 설정 → 카카오맵(로컬)** 사용 설정을 켭니다. (키가 없거나 호출이 실패하면 목 매장 목록으로 자동 전환)

## 폴더 구조

| 경로 | 내용 |
| --- | --- |
| `src/app/` | expo-router 라우트. `login`(A2) · `(onboarding)/step1~7`(B1~B7) · `(tabs)/today·nearby·log·my` · `store/[id]`(D3) · `menu/[id]`(D4) · `log/add`(E2) · `my/*`(F2~F5) |
| `src/components/` | 공통 컴포넌트 (Badge, Gauge, BottomSheet, Input, Toast …) |
| `src/domain/` | 순수 로직 — 목표량(`targets`) · 판정 엔진(`judge`) · 성향 규칙 분류(`diet`) · 하루 요약(`summary`). React 의존 없음, 전부 jest 테스트 |
| `src/data/` | 시드 데이터 `brands.json`(12개 브랜드) · `menus.json`(158개 메뉴) + 로더 |
| `src/services/` | 외부 I/O — `supabase`(클라이언트) · `auth`(로그인 도우미) · `kakao` · `location` · `ai/`(성향 분류 LLM) · `repo/`(저장소: `local` · `supabase` · `migrate`) |
| `src/state/` | zustand 스토어 — `session` · `profile` · `day` · `nearby` · `onboarding` · `bootstrap` |
| `src/theme/` | 디자인 토큰 (색·간격·글꼴·그림자) |
| `supabase/migrations/` | SQL |
| `docs/` | IA, 디자인 시안 |
| `assets/fonts/` | Pretendard |

## 판정 규칙 요약

판정·순위·이유 문구는 **전부 규칙과 템플릿**입니다. (AI 는 온보딩 성향 분류 1회뿐) 코드: [`src/domain/judge.ts`](src/domain/judge.ts)

- **점수 = 칼로리 점수 × 0.7 + 강조 영양소 점수 × 0.3** (0~100)
  - 칼로리 곡선: 메뉴 kcal ÷ 오늘 남은 kcal 이 **30% 이하면 100점**, 30~40% 는 100→40, 40~60% 는 40→0, 60% 초과는 0점.
  - 강조 영양소(목적별 3~4개): 남은 양 대비 25% 이하면 100점, 80% 이상이면 0점. 단백질은 거꾸로 많을수록 높음. 값이 없는 영양소는 평균에서 뺍니다.
  - 식단 유형 보정(저당형 당 15 g↑ −15, 저염형 나트륨 800 mg↑ −15, 고단백 증량형 단백질 20 g↑ +10 …)과 목적 보정(혈당 관리 당 20 g↑ −15, 콜레스테롤 포화지방 5 g↑ −10).
- **3단계**: 70점 이상 **좋음** · 45~69 **괜찮음** · 44 이하 **오늘은 패스**. 메뉴 하나가 남은 칼로리를 넘으면 점수와 관계없이 "오늘은 패스".
- **음료 상한**: 80 kcal 이상 음료는 최대 69점(괜찮음). 단백질 12 g 이상 음료는 예외. 30 kcal 미만(아메리카노·제로 음료)은 85점 상한 — 실제 식사보다 위에 서지 않게.
- **정보 없음**: 신뢰등급 `none` 이거나 영양 정보가 없으면 판정 배지를 달지 않고 **"아직 추가되지 않은 정보입니다"** + 이유 한 줄. 숫자를 0 으로 채우지 않습니다.
- **옵션 반영**: 사이즈·시럽 빼기 등 옵션의 영양 차이를 더해 즉시 다시 판정하고, 한 단계 좋아지는 옵션이 있으면 구매 가이드("시럽 빼면 좋음이 돼요")를 붙입니다.
- 문구는 허용의 언어 — "842 kcal 남음", 넘겼을 때는 "오늘은 여기까지, 내일 다시 채워져요".

## 시드 데이터와 신뢰등급

| 등급 | 뜻 | 시드 메뉴 수 |
| --- | --- | --- |
| `official` 공식 영양표 | 브랜드가 공개한 영양표를 그대로 옮기고 `sourceUrl` 을 적은 것 | **2개** (이디야 흑임자 크림 라떼 HOT·ICED) |
| `estimated` 추정치 | 공개 자료·일반 레시피를 바탕으로 사이즈·옵션을 계산한 값 | 139개 |
| `none` 정보 없음 | 확인된 정보가 없어 판정하지 않음 | 17개 (메가MGC커피·컴포즈커피·본죽 등) |
| `user` 내가 입력 | 사용자가 직접 입력한 기록 | — |

**남은 작업**: 현재 시드 대부분이 `estimated` 입니다. 각 브랜드 공식 영양표(홈페이지·앱의 영양성분 페이지)를 확인해 값을 대조하고, 출처 URL 을 적을 수 있는 메뉴부터 `official` 로 올려야 합니다. 앱은 등급을 항상 화면에 표시하므로 추정치가 공식값처럼 보이지는 않습니다.

## 검증

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # jest (도메인·데이터·저장소·스토어)
npx expo export --platform web    # 웹 번들이 깨지지 않는지
npx expo config --type public     # app.json 설정 확인
```

## 알려진 제한

- **사진 없음**: 메뉴·매장 사진은 저작권 때문에 넣지 않았고, 카테고리 아이콘 타일로 대신합니다.
- **소셜 로그인은 Supabase 설정이 필요**합니다. 미설정 상태의 카카오/Apple/Google 버튼은 닉네임만 받는 로컬 로그인입니다. 웹 미리보기에서는 소셜 OAuth 를 지원하지 않아 이메일로 안내합니다.
- **탈퇴는 데이터만 지웁니다**: 앱(anon 키)에서는 `auth.users` 계정 자체를 지울 수 없어, 계정 삭제는 서버 함수(service role)가 필요합니다.
- **오프라인 동기화 없음**: Supabase 모드에서 네트워크가 끊기면 저장이 실패하고(화면에는 반영) 다시 시도하지 않습니다.
- **웹 하이드레이션 경고**: 정적 웹 export 에서 첫 렌더와 클라이언트 상태(로컬 세션·날짜)가 달라 콘솔에 하이드레이션 경고가 뜰 수 있습니다. 동작에는 영향이 없습니다.
- 결제·AI 종합 피드백(F5)은 미리보기 카드만 있고 실제 동작하지 않습니다.

## 글꼴

Pretendard — © Kil Hyung-jin, [SIL Open Font License 1.1](https://github.com/orioncactus/pretendard/blob/main/LICENSE) · https://github.com/orioncactus/pretendard
