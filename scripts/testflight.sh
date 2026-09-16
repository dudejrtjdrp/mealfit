#!/usr/bin/env bash
# TestFlight 업로드 — 맥에서 실행: npm run testflight
# Xcode에 Apple ID(팀 AW9XRML8T7)가 로그인돼 있어야 한다. 빌드 번호는 시각(YYYYMMDDHHMM)으로 자동 증가.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
TEAM_ID="AW9XRML8T7"
OUT="build/testflight"
rm -rf "$OUT" && mkdir -p "$OUT"

echo "▶ prebuild (ios)"
npx expo prebuild --platform ios --no-install
(cd ios && pod install)

echo "▶ archive (build $BUILD_NUMBER)"
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Release \
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

echo "✅ 업로드 완료 (build $BUILD_NUMBER). App Store Connect → TestFlight에서 처리(10~30분) 후 테스터에게 배포됩니다."
