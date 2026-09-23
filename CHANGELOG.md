# 패치노트

mealing(mealfit) 버전별 변경 사항. `npm run release` 로 자동 생성.

## 0.2.0 (2026-09-23)

### 새 기능
- **onboarding** 온보딩 챗봇 대화형 전환(밀리) (b154a02)
- **ui** 전 화면 리디자인 적용 (746c1ef)
- **theme** mealing 그린 디자인 토큰 (fabe5ce)

### 고친 것
- **ui** 한국어 줄바꿈을 어절 단위로 (4e0c566)

### 개선
- **theme** 이전 토큰 별칭·호환 prop 정리 (7d1f96d)

### 기타
- **brand** 앱 표시 이름 mealing (76f5f8b)

## 0.1.0 (2026-09-16)

### 새 기능
- **brand** 앱 아이콘을 브랜드 그린 그릇·새싹 아이콘으로 교체 (d8a963f)
- **auth** Apple 네이티브 로그인·Google OAuth·카카오 안내 문구, 로그인 화면 버튼 4개 (8254006)
- **supabase** 스키마·RLS·저장소 구현, 이메일/OAuth 로그인, 로컬→서버 1회 마이그레이션, README (6f5c462)
- **tabs** 오늘·주변·기록·마이 탭, 매장 판정(D3)·메뉴 상세(D4)·기록 추가(E2)·마이 하위 화면 (8390ab6)
- **judge** 판정 점수 연속형 재조정·음료 상한·성향 규칙 보정 (93897dd)
- **onboarding** 공통 컴포넌트·로그인(A2)·온보딩 7단계(B1~B7)·탭바 (e9932a8)
- **domain** 목표량 계산·판정 엔진·성향 분류·시드 메뉴 158개·로컬 저장소 (7079194)

### 기타
- 버전업·패치노트 자동화 (npm run release) (05879b1)
- **ios** TestFlight 업로드 스크립트, iOS 아이콘을 앱 아이콘으로 (ced6a84)
- **ios** Apple 팀 ID 지정 (9f5d2f3)
- ios/android 스크립트를 expo run 으로 (맥에서 prebuild 실행 반영) (c1d061c)
- 도메인·데이터·저장소 API 계약(스텁) 추가 (c582102)
- Expo 57 프로젝트 골격, 디자인 토큰, 도메인 타입 계약 (efa42ff)
- Initial commit (74a4be4)
