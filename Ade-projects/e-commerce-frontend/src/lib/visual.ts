const GRID = 4;
const SIZE = 32;

export const SIGNATURE_LENGTH = GRID * GRID * 3;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = src;
  });
}

/**
 * A coarse colour layout of a picture: the average red, green and blue of each
 * cell in a 4x4 grid, each between 0 and 1. Two photos of similar-looking
 * products land close together.
 */
export async function signatureFromSource(source: File | Blob | string): Promise<number[]> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Image search is not supported in this browser.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const cell = SIZE / GRID;
    const sums = new Array<number>(SIGNATURE_LENGTH).fill(0);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = ((Math.floor(y / cell) * GRID) + Math.floor(x / cell)) * 3;
        const px = (y * SIZE + x) * 4;
        sums[idx] += data[px];
        sums[idx + 1] += data[px + 1];
        sums[idx + 2] += data[px + 2];
      }
    }
    const per = cell * cell * 255;
    return sums.map((v) => Math.round((v / per) * 1000) / 1000);
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}

export function signatureDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < SIGNATURE_LENGTH; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

export const similarityPercent = (a: number[], b: number[]) => Math.max(0, Math.round((1 - signatureDistance(a, b) / Math.sqrt(SIGNATURE_LENGTH)) * 100));
