#!/usr/bin/env bash
# TestFlight 업로드 — 맥에서 실행: npm run testflight
# Xcode에 Apple ID(팀 AW9XRML8T7)가 로그인돼 있어야 한다.
# 빌드 번호는 순번: app.json ios.buildNumber 를 쓰고, 업로드 성공 시 +1 로 올려 커밋한다.
# (애플은 앱 전체에서 이전 업로드보다 큰 번호만 허용 — 절대 초기화하지 말 것)
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_NUMBER="${BUILD_NUMBER:-$(node -p "require('./app.json').expo.ios.buildNumber")}"
TEAM_ID="AW9XRML8T7"
OUT="build/testflight"
rm -rf "$OUT" && mkdir -p "$OUT"

echo "▶ prebuild (ios, clean — 이전 빌드 잔재로 아이콘·팟 누락되는 사고 방지)"
npx expo prebuild --platform ios --no-install --clean
(cd ios && pod install)

# 워크스페이스·스킴은 expo.name 에 따라 바뀌므로 자동 감지 (mealing 개명 대응)
WS=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WS" .xcworkspace)
echo "▶ workspace: $WS / scheme: $SCHEME"

# --clean 재생성 시 Info.plist 의 CFBundleVersion 이 app.json 의 "1" 로 고정됨 →
# 업로드가 "이미 사용된 빌드 번호" 로 거절되므로 타임스탬프 빌드 번호를 plist 에 직접 쓴다.
PLIST="ios/$SCHEME/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$PLIST"
echo "▶ CFBundleVersion=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")"

echo "▶ archive (build $BUILD_NUMBER)"
xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
  -destination generic/platform=iOS -archivePath "$OUT/app.xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive | tail -n 20

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

echo "▶ upload to App Store Connect"
xcodebuild -exportArchive -archivePath "$OUT/app.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  -allowProvisioningUpdates | tail -n 20

# 업로드 성공 → 다음 빌드 번호 +1 커밋
NEXT=$((BUILD_NUMBER + 1))
node -e "const f='app.json',j=require('./'+f);j.expo.ios.buildNumber=String($NEXT);require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
git -c user.name=dudejrtjdrp -c user.email=dudejrtjdrp@naver.com add app.json
git -c user.name=dudejrtjdrp -c user.email=dudejrtjdrp@naver.com commit -q -m "chore(ios): 빌드 $BUILD_NUMBER 업로드 — 다음 번호 $NEXT" || true

[ -f release/whats-new.txt ] && { echo "── TestFlight '테스트할 내용'에 붙여넣기 ──"; cat release/whats-new.txt; }
echo "✅ 업로드 완료 (build $BUILD_NUMBER). App Store Connect → TestFlight에서 처리(10~30분) 후 테스터에게 배포됩니다."
