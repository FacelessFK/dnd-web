import {
  uploadedPortraitDataUrlMaxLength,
  uploadedPortraitSizeMaxBytes,
} from '@dnd/protocol';

import { portraitSourceImageMaxBytes } from './character-portrait-image';

export function getPortraitLimitMessage(isFa: boolean): string {
  const limitMb = uploadedPortraitSizeMaxBytes / 1_000_000;

  return isFa
    ? `تصویر پرتره خیلی بزرگ است. لطفا تصویر را به حداکثر ${limitMb} مگابایت کاهش دهید یا تصویر کوچک‌تری انتخاب کنید.`
    : `The portrait image is too large. Please reduce it to ${limitMb} MB or choose a smaller image.`;
}

export function getPortraitSourceLimitMessage(isFa: boolean): string {
  const limitMb = portraitSourceImageMaxBytes / 1_000_000;

  return isFa
    ? `تصویر انتخابی خیلی بزرگ است. لطفا فایل را به حداکثر ${limitMb} مگابایت کاهش دهید.`
    : `The selected image is too large. Please choose an image up to ${limitMb} MB.`;
}

export function getUnsupportedPortraitTypeMessage(isFa: boolean): string {
  return isFa
    ? 'فرمت تصویر پشتیبانی نمی‌شود. فقط PNG، JPEG یا WebP قابل قبول است.'
    : 'Unsupported image format. Use PNG, JPEG, or WebP.';
}

export function getPortraitDataUrlValidationMessage(
  dataUrl: string,
  isFa: boolean,
): string | null {
  return dataUrl.startsWith('data:') &&
    dataUrl.length > uploadedPortraitDataUrlMaxLength
    ? getPortraitLimitMessage(isFa)
    : null;
}

export function getPortraitFileValidationMessage(
  file: Pick<File, 'size' | 'type'>,
  isFa: boolean,
): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return getUnsupportedPortraitTypeMessage(isFa);
  }

  return file.size > portraitSourceImageMaxBytes
    ? getPortraitSourceLimitMessage(isFa)
    : null;
}

export function formatCharacterLibrarySaveFailure(
  message: string,
  isFa: boolean,
): string {
  const isPortraitLimitError =
    message.includes(String(uploadedPortraitDataUrlMaxLength)) ||
    message.includes(String(uploadedPortraitSizeMaxBytes));

  return isPortraitLimitError ? getPortraitLimitMessage(isFa) : message;
}
