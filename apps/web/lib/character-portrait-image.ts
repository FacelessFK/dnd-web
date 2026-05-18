import { uploadedPortraitDataUrlMaxLength } from '@dnd/protocol';

export const portraitSourceImageMaxBytes = 8_000_000;
export const portraitTargetImageMaxBytes = 700_000;
export const portraitMaxPixelDimension = 768;

const outputMimeTypes = ['image/webp', 'image/jpeg'] as const;
const compressionQualities = [0.82, 0.72, 0.62, 0.52, 0.42] as const;

export type CompressedPortraitImage = {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp';
  originalSizeBytes: number;
  sizeBytes: number;
};

function calculateCanvasSize(
  width: number,
  height: number,
): { height: number; width: number } {
  const longestSide = Math.max(width, height);

  if (longestSide <= portraitMaxPixelDimension) {
    return { height, width };
  }

  const scale = portraitMaxPixelDimension / longestSide;

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: (typeof outputMimeTypes)[number],
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('error', () => {
      reject(new Error('Unable to read compressed portrait image.'));
    });
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read compressed portrait image.'));
      }
    });
    reader.readAsDataURL(blob);
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener('error', () => {
      reject(new Error('Unable to load portrait image.'));
    });
    image.addEventListener('load', () => resolve(image));
    image.src = url;
  });
}

export async function compressPortraitFile(
  file: File,
): Promise<CompressedPortraitImage> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(objectUrl);
    const canvas = document.createElement('canvas');
    const size = calculateCanvasSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
    );
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to prepare portrait image.');
    }

    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(image, 0, 0, size.width, size.height);

    let fallback: Blob | null = null;

    for (const mimeType of outputMimeTypes) {
      for (const quality of compressionQualities) {
        const blob = await canvasToBlob(canvas, mimeType, quality);

        if (!blob) {
          continue;
        }

        fallback = fallback ?? blob;

        if (blob.size <= portraitTargetImageMaxBytes) {
          const dataUrl = await blobToDataUrl(blob);

          if (dataUrl.length <= uploadedPortraitDataUrlMaxLength) {
            return {
              dataUrl,
              mimeType,
              originalSizeBytes: file.size,
              sizeBytes: blob.size,
            };
          }
        }
      }
    }

    if (!fallback) {
      throw new Error('Unable to compress portrait image.');
    }

    const dataUrl = await blobToDataUrl(fallback);

    return {
      dataUrl,
      mimeType: fallback.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
      originalSizeBytes: file.size,
      sizeBytes: fallback.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
