// ROI coordinates configuration
// All values are normalized (0.0 to 1.0) relative to image dimensions

export type RoiConfig = {
  name: { x: number; y: number; w: number; h: number };
  cost: { x: number; y: number; w: number; h: number };
  main1: { x: number; y: number; w: number; h: number };
  main2: { x: number; y: number; w: number; h: number };
  subs: Array<{ x: number; y: number; w: number; h: number }>;
};

export const defaultRoiConfig: RoiConfig = {
  name: { x: 0.74, y: 0.13, w: 0.19, h: 0.04 },
  cost: { x: 0.74, y: 0.17, w: 0.06, h: 0.02 },
  main1: { x: 0.76, y: 0.22, w: 0.19, h: 0.03 },
  main2: { x: 0.76, y: 0.255, w: 0.19, h: 0.03 },
  subs: [
    { x: 0.75, y: 0.29, w: 0.20, h: 0.03 },
    { x: 0.75, y: 0.32, w: 0.20, h: 0.03 },
    { x: 0.75, y: 0.35, w: 0.20, h: 0.03 },
    { x: 0.75, y: 0.38, w: 0.20, h: 0.03 },
    { x: 0.75, y: 0.41, w: 0.20, h: 0.03 },
  ],
};

export function saveRoiConfig(config: RoiConfig) {
  localStorage.setItem('roiConfig', JSON.stringify(config));
}

export function loadRoiConfig(): RoiConfig {
  const saved = localStorage.getItem('roiConfig');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return defaultRoiConfig;
    }
  }
  return defaultRoiConfig;
}
