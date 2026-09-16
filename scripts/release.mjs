#!/usr/bin/env node
// 버전업 + 패치노트 — node scripts/release.mjs [patch|minor|major] [--dry]
// 마지막 `chore(release):` 커밋 이후의 커밋을 Angular 타입별로 모아 CHANGELOG.md 맨 위에 추가하고,
// app.json(version, ios.buildNumber 초기화)·package.json 버전을 올린 뒤 커밋한다.
// --current: 버전은 그대로 두고 현재 버전으로 패치노트만 기록 (첫 릴리스용).
// 레벨 생략 시: feat 가 있으면 minor, 아니면 patch (1.0 전까지 major 자동 없음).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const keep = args.includes('--current');
const forced = args.find((a) => ['patch', 'minor', 'major'].includes(a));

const lastRelease = sh(`git log --grep='^chore(release):' --format=%H -n 1`);
const range = lastRelease ? `${lastRelease}..HEAD` : 'HEAD';
const raw = sh(`git log ${range} --no-merges --format=%s%x1f%h%x1e`);
const commits = raw.split('\x1e').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [subject, hash] = s.split('\x1f');
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  return m ? { type: m[1], scope: m[2], breaking: !!m[3], text: m[4], hash } : { type: 'other', text: subject, hash };
}).filter((c) => !(c.type === 'chore' && c.scope === 'release'));

if (commits.length === 0) { console.log('릴리스할 커밋이 없어요.'); process.exit(0); }

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = app.expo.version.split('.').map(Number);
const hasFeat = commits.some((c) => c.type === 'feat');
const level = forced ?? (hasFeat ? 'minor' : 'patch');
const next = keep ? app.expo.version : level === 'major' ? `${ma + 1}.0.0` : level === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

const SECTIONS = [
  ['새 기능', (c) => c.type === 'feat'],
  ['고친 것', (c) => c.type === 'fix'],
  ['개선', (c) => ['perf', 'refactor', 'style'].includes(c.type)],
  ['기타', (c) => !['feat', 'fix', 'perf', 'refactor', 'style', 'test', 'docs'].includes(c.type)],
];
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
let md = `## ${next} (${date})\n`;
for (const [title, pick] of SECTIONS) {
  const list = commits.filter(pick);
  if (!list.length) continue;
  md += `\n### ${title}\n` + list.map((c) => `- ${c.scope ? `**${c.scope}** ` : ''}${c.text} (${c.hash})`).join('\n') + '\n';
}

// TestFlight "테스트할 내용"용 짧은 요약 (새 기능·고친 것만, 해시 없이)
const whatsNew = commits.filter((c) => c.type === 'feat' || c.type === 'fix')
  .map((c) => `• ${c.text}`).join('\n') || '• 내부 개선';

if (dry) { console.log(`→ ${app.expo.version} → ${next} (${level})\n\n${md}\n---\n${whatsNew}`); process.exit(0); }

const head = '# 패치노트\n\n식사 개인화(mealfit) 버전별 변경 사항. `npm run release` 로 자동 생성.\n\n';
const prev = fs.existsSync('CHANGELOG.md') ? fs.readFileSync('CHANGELOG.md', 'utf8').replace(head, '') : '';
fs.writeFileSync('CHANGELOG.md', head + md + (prev ? '\n' + prev : ''));
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/whats-new.txt', `v${next}\n${whatsNew}\n`);

app.expo.version = next;
if (!keep) app.expo.ios = { ...app.expo.ios, buildNumber: '1' };
pkg.version = next;
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

sh('git add CHANGELOG.md app.json package.json release/whats-new.txt');
const body = whatsNew.split('\n').slice(0, 3).join('\n');
execSync(`git commit -q -F -`, { input: `chore(release): v${next}\n\n${body}\n` });
console.log(`✅ v${next} 릴리스 커밋 완료\n\n${md}`);
