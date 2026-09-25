import { TERMS } from '@/legal/content';
import { LegalPage } from '@/legal/LegalPage';

/** F4 이용약관 (초안) */
export default function Terms() {
  return <LegalPage doc={TERMS} />;
}
