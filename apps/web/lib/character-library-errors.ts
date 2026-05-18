import {
  uploadedPortraitDataUrlMaxLength,
  uploadedPortraitSizeMaxBytes,
} from '@dnd/protocol';

export function getPortraitLimitMessage(isFa: boolean): string {
  const limitMb = uploadedPortraitSizeMaxBytes / 1_000_000;

  return isFa
    ? `تصویر پرتره خیلی بزرگ است. لطفا تصویر را به حداکثر ${limitMb} مگابایت کاهش دهید یا تصویر کوچک‌تری انتخاب کنید.`
    : `The portrait image is too large. Please reduce it to ${limitMb} MB or choose a smaller image.`;
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
  return dataUrl.length > uploadedPortraitDataUrlMaxLength
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

  return file.size > uploadedPortraitSizeMaxBytes
    ? getPortraitLimitMessage(isFa)
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
