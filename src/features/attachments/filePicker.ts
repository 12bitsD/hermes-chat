import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { Attachment } from '../../types';

export type AttachmentKind = Attachment['kind'];

export interface PickedFile {
  name: string;
  size: number;
  uri: string;
  kind: AttachmentKind;
  previewContent?: string;
  mimeType?: string;
}

export async function pickFile(): Promise<PickedFile | null> {
  if (Platform.OS === 'web') return pickFileWeb();
  return pickFileNative();
}

async function pickFileNative(): Promise<PickedFile | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const asset = res.assets[0];
    const kind = guessKindFromName(asset.name, asset.mimeType ?? '');
    let previewContent: string | undefined;
    if (kind === 'text') {
      try {
        previewContent = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      } catch {
        // Text preview is optional; failed reads should not block attachment.
      }
    }
    return {
      name: asset.name,
      size: asset.size ?? 0,
      uri: asset.uri,
      kind,
      previewContent,
      mimeType: asset.mimeType ?? undefined,
    };
  } catch (error) {
    console.warn('[pickFileNative] failed', error);
    return null;
  }
}

async function pickFileWeb(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const kind = guessKindFromName(file.name, file.type);
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          size: file.size,
          uri: reader.result as string,
          kind,
          previewContent: kind === 'text' ? reader.result as string : undefined,
          mimeType: file.type || undefined,
        });
      };
      if (kind === 'text') reader.readAsText(file);
      else reader.readAsDataURL(file);
    };
    input.click();
  });
}

export function guessKindFromName(name: string, mime: string): AttachmentKind {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.includes('presentation') || /\.(pptx|ppt)$/i.test(name)) return 'ppt';
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name)) return 'image';
  if (mime.startsWith('text/') || /\.(md|txt|json|js|ts|py|css|html|xml|yaml|yml|csv)$/i.test(name)) return 'text';
  return 'other';
}
