import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import type { PermissionStatus } from './location';

/**
 * F4 설정의 카메라·마이크(음성 인식) 권한 — 상태 읽기 · 요청.
 * 웹은 브라우저가 쓸 때마다 묻고 앱에서 설정을 열 수 없어 'browser' 로 돌려준다.
 */
export type DevicePermission = PermissionStatus | 'browser';
export type PermissionKind = 'camera' | 'microphone';

const toStatus = (s: string | undefined): PermissionStatus => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined');

export async function getDevicePermission(kind: PermissionKind): Promise<DevicePermission> {
  if (Platform.OS === 'web') return 'browser';
  try {
    const res = kind === 'camera' ? await ImagePicker.getCameraPermissionsAsync() : await ExpoSpeechRecognitionModule.getPermissionsAsync();
    return toStatus(res.status);
  } catch {
    return 'undetermined';
  }
}

export async function requestDevicePermission(kind: PermissionKind): Promise<DevicePermission> {
  if (Platform.OS === 'web') return 'browser';
  try {
    const res = kind === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return toStatus(res.status);
  } catch {
    return 'denied';
  }
}
