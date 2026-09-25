# mealfit — 작업 규칙 (모든 에이전트 필독)

식사 개인화 서비스 MVP. "내 건강관리 습관에 맞는 메뉴를, 지금 내 주변에서 찾아주는" 앱.
핵심 루프: 온보딩 → 성향 분류 → 오늘 목표량 → 기록 → 주변 메뉴 판정 → 구매 가이드.

- 정보구조·화면 목록: `docs/IA.md` (화면 ID A1~F5를 라우트·컴포넌트 이름에 그대로 쓴다)
- 디자인 시안: `docs/design/*.png` — **픽셀 단위로 이 시안을 따른다.** 시안이 없는 화면은 시안의 톤(카드·라운드·여백·배지)을 그대로 적용
- 디자인 토큰: `src/theme/index.ts` — 색·간격·글꼴은 여기서만 가져온다 (하드코딩 금지)
- 공통 타입: `src/domain/types.ts` — 모듈 간 계약. 바꾸려면 다른 모듈 영향까지 같이 수정

## 스택
Expo SDK 57 · expo-router(파일 라우팅, `src/app/`) · TypeScript strict · zustand · AsyncStorage · expo-location · @supabase/supabase-js · jest-expo.
Expo 57은 이전 버전과 다르다 — API가 불확실하면 https://docs.expo.dev/versions/v57.0.0/ 를 먼저 읽는다. 세션 샌드박스에서는 `api.expo.dev`가 막혀 있으니 `npx expo install` 대신 `npm install <pkg>@<버전>`을 쓰고, 버전은 `node_modules/expo/bundledNativeModules.json`에서 찾는다.

## 폴더
```
src/app/                 라우트 (A2 login, (onboarding)/step1~7, (tabs)/today|nearby|log|my, store/[id], menu/[id], log/add, log/ai ...)
src/components/          공통 컴포넌트 (Badge, Gauge, StoreCard, MenuCard, OptionChip, EmptyState, Button, ProgressSteps, BottomSheet ...)
src/domain/              순수 로직 (타입, 목표량 계산, 판정 엔진, 성향 분류) — React 의존 금지, 전부 jest 테스트
src/data/                시드 데이터 (brands.json, menus.json, options) + 로더
src/services/            외부 I/O (location, kakao, supabase, ai) 와 저장소 추상화 (repo/)
src/state/               zustand 스토어 (profile, day, logs)
src/theme/               토큰
supabase/migrations/     SQL
docs/                    IA, 시안, 결정 기록
```

## 동작 원칙 (기획서에서 온 것 — 반드시 지킨다)
1. **먹기 전 판정이 먼저**: 사용자가 검색해서 입력하는 게 아니라 앱이 주변 메뉴를 먼저 판정해 보여준다.
2. **허용의 언어**: "오늘 더 먹을 수 있어요", "842 kcal 남음"까지는 OK. 목표를 넘은 양은 숨기지 않고 빨간색(theme.over)으로 수치를 보여준다(2026-09-25 효님 결정). 비난·금지 표현(제한·금지·나쁨·위험)은 여전히 쓰지 않고 사실을 말한다: "목표보다 320kcal 더 드셨어요" + "내일 다시 채워져요". ("초과"라는 단어 대신 "넘었어요·더 드셨어요")
3. **판정 3단계**: 좋음(good) · 괜찮음(ok) · 오늘은 패스(pass). 색은 theme의 good/ok/pass — 판정 배지에는 빨강을 쓰지 않는다.
   - 색 규칙: 빨강(theme.over / overBg)은 **'하루 목표를 넘은 양'** 표시에만 쓴다(넘은 kcal·영양소 수치, 링·바의 넘은 부분). 단백질은 많을수록 좋은 영양소라 목표를 넘어도 빨강으로 표시하지 않는다(domain/summary OVER_KEYS).
   - 예외: 매장 상세(D3)에서 담은 메뉴의 kcal은 하단 게이지를 빨강으로 채워 '먹으면 줄어드는 양'을 보여준다 (2026-09-25 효님 결정).
4. **숫자를 지어내지 않는다**: 영양 정보가 없으면 판정 배지 대신 "아직 추가되지 않은 정보입니다" + 이유 한 줄. 신뢰등급(official/estimated/none/user)을 항상 데이터에 싣는다. 시드 데이터에서 `official`은 공개 영양표 출처(sourceUrl)를 적을 수 있을 때만.
5. **AI는 두 곳만**: 판정·순위·이유 문구는 전부 규칙과 템플릿. AI는 ① 온보딩 B6 성향 분류 1회, ② E4 AI로 기록(사진·말·글 → 음식+대략 양) 두 곳뿐. 같은 서술은 캐시(정규화 텍스트 sha256 → 결과)로 재호출하지 않는다. 키가 없으면 규칙 기반으로 동작.
   - E4는 무료, 대신 기기별 하루 15회(domain/aiMeal AI_MEAL_DAILY_LIMIT)로 비용 상한 (2026-09-25 효님 결정). 횟수를 다 쓰거나 키가 없으면 글은 규칙으로 나누고, 사진은 말·글로 안내.
   - AI는 "무엇을, 대략 얼마나"만 뽑는다. 칼로리는 앱 데이터에서 같은 이름 메뉴를 찾아 쓰고, 없을 때만 AI 1인분 추정값이나 비슷한 메뉴를 **추정(estimated)**으로 쓴다. 사용자가 확인 카드에서 고친 뒤 기록한다. 사진은 저장하지 않는다.
6. **외부 키 없이도 전부 동작**: `.env`가 비어 있으면 Supabase 대신 로컬 저장소(AsyncStorage), 카카오 대신 목 매장 목록(역삼동 기준 시안과 같은 4곳 + α), AI 대신 규칙 분류. 목·자리표시가 아니라 실제로 도는 폴백이어야 한다.
7. **포지셔닝은 "건강관리"**: 브랜드 문구에 다이어트·감량이라는 단어를 앞세우지 않는다. 목적 목록에서는 써도 된다.

## 화면 규칙
- 기준 해상도 390×844. 하단 탭 4개: 오늘(today) · 주변(nearby) · 기록(log) · 마이(my). 시안의 "탐색"은 "주변"과 같은 것.
- 카드 radius 20, 페이지 좌우 20, 카드 안쪽 18~20, 배지 pill. 그림자는 theme.shadow.card.
- 모든 화면은 상태를 다 그린다: 로딩(스켈레톤) · 빈 상태 · 오류 · 정보 없음.
- 텍스트는 전부 한국어, 존댓말 "~해요"체.
- 이미지: 메뉴/매장 사진은 저작권 문제로 시드에 넣지 않는다. 시안의 사진 자리는 카테고리별 아이콘 타일(연한 배경 + 이모지/아이콘)로 대체.

## 검증
- `npm run typecheck` (tsc --noEmit) 와 `npm test` (jest) 는 항상 통과 상태로 유지.
- 도메인 로직은 테스트 먼저. 화면은 `npx expo export --platform web` 이 깨지지 않아야 한다.

## 커밋
- Angular 스타일 + 한글 제목: `feat(nearby): 주변 매장 목록 화면`, `fix(judge): 여유 0일 때 패스 처리`.
- 작업 단위마다 커밋 (기능 하나 = 커밋 하나). 본문에는 결정과 이유를 1~3줄.
- 커밋 작성자: `dudejrtjdrp <dudejrtjdrp@naver.com>` (GitHub 계정 이메일 — 2026-09-23 효님 확정, gmail 아님). 마지막 줄에 `Co-Authored-By: Claude <모델> <noreply@anthropic.com>` (실제 작업한 모델, 세션 링크가 있으면 `Claude-Session:` 줄도).
- `.env`, 토큰, `.local/` 은 절대 커밋하지 않는다.

## 릴리스·패치노트
- 사용자에게 보이는 변화(feat/fix)가 쌓여 한 번 배포할 만하면 `npm run release` 로 버전업 + `CHANGELOG.md` 패치노트 + `release/whats-new.txt`(TestFlight "테스트할 내용") 를 만들고 `chore(release): vX.Y.Z` 로 커밋한다.
- 버전 규칙: feat 포함 → minor, fix/기타만 → patch. 빌드 번호는 순번(app.json ios.buildNumber): `npm run testflight` 가 사용 후 +1 커밋. 릴리스 때도 초기화하지 않는다 (애플은 앱 전체에서 이전 업로드보다 큰 번호만 허용 — 2026-09-23 효님 확정).
- 그래서 커밋 제목은 사용자가 읽을 수 있는 한국어 한 줄로 쓴다 — 그대로 패치노트가 된다.
- **TestFlight 업로드마다 ASC "테스트할 내용" 갱신 (2026-09-25 효님 지시)**: 버전업한 빌드가 TestFlight에 올라가면(처리 완료 후) Claude가 브라우저(효님 맥 크롬)로 App Store Connect → 앱 "식사 개인화"(mealing) → TestFlight → 해당 빌드 → "테스트할 내용"(한국어)에 `release/whats-new.txt` 내용을 넣고 저장한다. 효님이 따로 말하지 않아도 매번. ASC 로그인이 풀려 있으면 효님에게 로그인만 부탁한다.
