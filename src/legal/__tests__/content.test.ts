import { CONTACT_EMAIL, DRAFT_NOTICE, PRIVACY, TERMS } from '../content';

const allText = (d: typeof TERMS) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.title, ...s.body])].join('\n');

describe('약관 초안', () => {
  it.each([TERMS, PRIVACY])('$title: 비난·금지 표현을 쓰지 않는다', (doc) => {
    expect(allText(doc)).not.toMatch(/초과|제한|금지|나쁨|위험/);
  });

  it('초안 표시와 문의 메일이 있다', () => {
    expect(DRAFT_NOTICE).toContain('초안');
    expect(allText(TERMS)).toContain(CONTACT_EMAIL);
    expect(allText(PRIVACY)).toContain(CONTACT_EMAIL);
  });

  it('개인정보처리방침은 실제 동작(위치 미저장·사진 미보관·로컬 저장)을 적는다', () => {
    const t = allText(PRIVACY);
    expect(t).toMatch(/카카오 로컬 API/);
    expect(t).toMatch(/서버에는 저장하지 않아요/);
    expect(t).toMatch(/사진.*보관하지 않아요/);
    expect(t).toMatch(/이 기기/);
  });
});
