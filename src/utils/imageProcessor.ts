// Note: Using Canvas API as fallback since @opencv/opencv-js may have issues with Vite
// For production, consider using opencv.js directly from CDN or sharp-based backend

import type { RoiConfig } from './roiConfig';

export type Rect = { x: number; y: number; width: number; height: number };

export type RoiResult = {
  binarized: HTMLCanvasElement;
  regions: {
    name: HTMLCanvasElement;
    cost: HTMLCanvasElement;
    main1: HTMLCanvasElement;
    main2: HTMLCanvasElement;
    subs: HTMLCanvasElement[];
  };
  rects: {
    nameRect: Rect;
    costRect: Rect;
    main1Rect: Rect;
    main2Rect: Rect;
    subRects: Rect[];
  };
};

/**
 * Binarize an image using canvas API
 */
function binarizeCanvas(canvas: HTMLCanvasElement, threshold: number = 128): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = canvas.width;
  result.height = canvas.height;
  const ctx = result.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, result.width, result.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = gray > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
  return result;
}

/**
 * Extract regions of interest from Echo status screenshot
 */
export function extractEchoRois(input: HTMLImageElement, config?: RoiConfig, threshold: number = 128): RoiResult {
  const canvas = document.createElement('canvas');
  canvas.width = input.naturalWidth;
  canvas.height = input.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(input, 0, 0);

  // Binarize entire image
  const binCanvas = binarizeCanvas(canvas, threshold);

  // Get ROI rectangles based on aspect ratio
  const { nameRect, costRect, main1Rect, main2Rect, subRects } = getRectsByAspect(
    canvas.width,
    canvas.height,
    config
  );

  // Crop regions
  const regions = {
    name: cropCanvas(binCanvas, nameRect),
    cost: cropCanvas(binCanvas, costRect),
    main1: cropCanvas(binCanvas, main1Rect),
    main2: cropCanvas(binCanvas, main2Rect),
    subs: subRects.map((r) => cropCanvas(binCanvas, r)),
  };

  return {
    binarized: binCanvas,
    regions,
    rects: { nameRect, costRect, main1Rect, main2Rect, subRects },
  };
}

/**
 * Calculate ROI rectangles based on aspect ratio
 * Assumes standard Wuthering Waves Echo detail screen layout
 */
function getRectsByAspect(
  w: number,
  h: number,
  config?: RoiConfig
): {
  nameRect: Rect;
  costRect: Rect;
  main1Rect: Rect;
  main2Rect: Rect;
  subRects: Rect[];
} {
  const cfg = config || {
    name: { x: 0.74, y: 0.13, w: 0.19, h: 0.04 },
    cost: { x: 0.74, y: 0.17, w: 0.06, h: 0.02 },
    main1: { x: 0.76, y: 0.22, w: 0.19, h: 0.03 },
    main2: { x: 0.76, y: 0.25, w: 0.19, h: 0.03 },
    subs: [
      { x: 0.75, y: 0.29, w: 0.20, h: 0.03 },
      { x: 0.75, y: 0.32, w: 0.20, h: 0.03 },
      { x: 0.75, y: 0.35, w: 0.20, h: 0.03 },
      { x: 0.75, y: 0.38, w: 0.20, h: 0.03 },
      { x: 0.75, y: 0.41, w: 0.20, h: 0.03 },
    ],
  };

  const rect = (x: number, y: number, ww: number, hh: number): Rect => ({
    x: Math.round(w * x),
    y: Math.round(h * y),
    width: Math.round(w * ww),
    height: Math.round(h * hh),
  });

  return {
    nameRect: rect(cfg.name.x, cfg.name.y, cfg.name.w, cfg.name.h),
    costRect: rect(cfg.cost.x, cfg.cost.y, cfg.cost.w, cfg.cost.h),
    main1Rect: rect(cfg.main1.x, cfg.main1.y, cfg.main1.w, cfg.main1.h),
    main2Rect: rect(cfg.main2.x, cfg.main2.y, cfg.main2.w, cfg.main2.h),
    subRects: cfg.subs.map((s) => rect(s.x, s.y, s.w, s.h)),
  };
}

function cropCanvas(canvas: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const cropped = document.createElement('canvas');
  cropped.width = rect.width;
  cropped.height = rect.height;
  const ctx = cropped.getContext('2d')!;
  ctx.drawImage(
    canvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );
  return cropped;
}
