import { PRIVACY } from '@/legal/content';
import { LegalPage } from '@/legal/LegalPage';

/** F4 개인정보처리방침 (초안) */
export default function Privacy() {
  return <LegalPage doc={PRIVACY} />;
}
