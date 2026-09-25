import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { showToast, ToastHost } from '../Toast';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const texts = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string);

describe('ToastHost', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('이전 토스트가 사라지는 중에 새 토스트가 오면 새 토스트가 그대로 보인다', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ToastHost />);
    });
    act(() => showToast('첫 번째'));
    expect(texts(r)).toContain('첫 번째');
    // 보이는 시간(2.2초)이 지나 페이드아웃(180ms)이 시작된 직후
    act(() => jest.advanceTimersByTime(2200 + 60));
    act(() => showToast('두 번째'));
    act(() => jest.advanceTimersByTime(1000));
    expect(texts(r)).toContain('두 번째');
    // 두 번째도 제 시간이 지나면 닫힌다
    act(() => jest.advanceTimersByTime(2200 + 500));
    expect(r.toJSON()).toBeNull();
    act(() => r.unmount());
  });
});
