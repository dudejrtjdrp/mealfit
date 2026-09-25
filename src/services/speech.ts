import { useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

/**
 * 말로 기록 — 폰의 음성 인식(iOS Speech · Android · 웹 Chrome)으로 글자로 바꾼다. AI 비용 없음.
 * 인식된 글은 onText 로 계속 흘려보내고, 말이 끝나면 onEnd(최종 글) 를 부른다.
 */
export type SpeechError = 'denied' | 'unavailable' | 'no-speech' | 'failed';

export function useSpeechInput({ onText, onEnd }: { onText: (t: string) => void; onEnd?: (finalText: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const last = useRef('');
  const active = useRef(false);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results?.[0]?.transcript ?? '';
    last.current = t;
    onText(t);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    if (!active.current) return;
    active.current = false;
    onEnd?.(last.current.trim());
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    active.current = false;
    if (e.error === 'aborted') return;
    setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' || e.error === 'speech-timeout' ? 'no-speech' : e.error === 'language-not-supported' ? 'unavailable' : 'failed');
  });

  const start = async (): Promise<boolean> => {
    setError(null);
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('unavailable');
        return false;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('denied');
        return false;
      }
      last.current = '';
      active.current = true;
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false, addsPunctuation: false });
      setListening(true);
      return true;
    } catch {
      active.current = false;
      setError('unavailable');
      return false;
    }
  };

  /** 그만 듣기 — 지금까지 들은 걸로 끝낸다 (end 이벤트에서 onEnd) */
  const stop = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  };

  /** 취소 — onEnd 없이 */
  const cancel = () => {
    active.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // 무시
    }
    setListening(false);
  };

  return { listening, error, start, stop, cancel };
}

export const SPEECH_ERROR_TEXT: Record<SpeechError, string> = {
  denied: '설정에서 마이크·음성 인식 권한을 켜 주시면 말로 기록할 수 있어요.',
  unavailable: '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.',
  'no-speech': '잘 못 들었어요. 한 번 더 말해 주세요.',
  failed: '음성 인식이 잠깐 안 됐어요. 다시 해 보거나 글로 적어 주세요.',
};

/** 권한을 거절한 경우 — 안내 옆에 "설정 열기"(Linking.openSettings)를 함께 보여준다 */
export function speechErrorNeedsSettings(e: SpeechError | null | undefined): boolean {
  return e === 'denied';
}
