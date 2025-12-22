import React from 'react';
import type { RoiConfig } from '../utils/roiConfig';

type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  binarized?: HTMLCanvasElement;
  debugImage?: string;
  ocrRaw?: string;
  confidence?: number;
  rects?: {
    nameRect: Rect;
    costRect: Rect;
    main1Rect: Rect;
    main2Rect: Rect;
    subRects: Rect[];
  };
  regions?: {
    name: HTMLCanvasElement;
    cost: HTMLCanvasElement;
    main1: HTMLCanvasElement;
    main2: HTMLCanvasElement;
    subs: HTMLCanvasElement[];
  };
  roiConfig?: RoiConfig;
  threshold?: number;
  ocrResults?: Record<string, { text: string; confidence: number }>;
  onConfigChange?: (config: RoiConfig) => void;
  onThresholdChange?: (threshold: number) => void;
  show: boolean;
};

export const DebugPanel: React.FC<Props> = ({
  binarized,
  debugImage,
  ocrRaw,
  confidence,
  rects,
  regions,
  roiConfig,
  threshold = 128,
  ocrResults = {},
  onConfigChange,
  onThresholdChange,
  show,
}) => {
  const [binarizedUrl, setBinarizedUrl] = React.useState<string>();
  const [tab, setTab] = React.useState<'rects' | 'binary' | 'info' | 'config' | 'regions'>('info');
  const [regionUrls, setRegionUrls] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (binarized) {
      setBinarizedUrl(binarized.toDataURL());
    }
  }, [binarized]);

  React.useEffect(() => {
    if (regions) {
      const urls: Record<string, string> = {};
      urls.name = regions.name.toDataURL();
      urls.cost = regions.cost.toDataURL();
      urls.main1 = regions.main1.toDataURL();
      urls.main2 = regions.main2.toDataURL();
      regions.subs.forEach((canvas, i) => {
        urls[`sub${i + 1}`] = canvas.toDataURL();
      });
      setRegionUrls(urls);
    }
  }, [regions]);

  if (!show) return null;

  const handleConfigChange = (key: keyof RoiConfig, field: string, value: number) => {
    if (!roiConfig || !onConfigChange) return;
    const newConfig = { ...roiConfig };
    const obj = newConfig[key] as any;
    obj[field] = Math.max(0, Math.min(1, value));
    onConfigChange(newConfig);
  };

  const handleSubChange = (index: number, field: string, value: number) => {
    if (!roiConfig || !onConfigChange) return;
    const newConfig = { ...roiConfig };
    newConfig.subs[index][field as keyof typeof newConfig.subs[0]] = Math.max(0, Math.min(1, value));
    onConfigChange(newConfig);
  };

  const renderCoordInput = (
    value: number,
    onChange: (val: number) => void,
    label: string
  ) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 w-3">{label}</span>
        <input
          type="number"
          min="0"
          max="1"
          step="0.001"
          defaultValue={value.toFixed(3)}
          onBlur={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="bg-slate-700 text-white px-1 py-0.5 rounded text-xs flex-1"
        />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1"
      />
    </div>
  );

  return (
    <div className="grid gap-2 rounded border p-3 bg-slate-900 text-slate-100">
      <div className="flex gap-2 items-center justify-between">
        <h2 className="text-sm font-semibold">Debug Panel</h2>
        <div className="flex gap-1 text-xs flex-wrap">
          <button
            onClick={() => setTab('rects')}
            className={`px-2 py-1 rounded ${tab === 'rects' ? 'bg-emerald-600' : 'bg-slate-800'}`}
          >
            ROI Rects
          </button>
          <button
            onClick={() => setTab('regions')}
            className={`px-2 py-1 rounded ${tab === 'regions' ? 'bg-emerald-600' : 'bg-slate-800'}`}
          >
            Regions
          </button>
          <button
            onClick={() => setTab('binary')}
            className={`px-2 py-1 rounded ${tab === 'binary' ? 'bg-emerald-600' : 'bg-slate-800'}`}
          >
            Binary
          </button>
          <button
            onClick={() => setTab('info')}
            className={`px-2 py-1 rounded ${tab === 'info' ? 'bg-emerald-600' : 'bg-slate-800'}`}
          >
            Info
          </button>
          <button
            onClick={() => setTab('config')}
            className={`px-2 py-1 rounded ${tab === 'config' ? 'bg-emerald-600' : 'bg-slate-800'}`}
          >
            Config
          </button>
        </div>
      </div>

      {tab === 'rects' && debugImage && (
        <div className="border bg-black rounded overflow-auto max-h-96">
          <img src={debugImage} alt="ROI rects" className="max-w-full" />
        </div>
      )}

      {tab === 'regions' && (
        <div className="space-y-2 max-h-96 overflow-auto">
          {Object.entries(regionUrls).map(([key, url]) => (
            <div key={key} className="bg-slate-800 p-2 rounded">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold uppercase">{key}</span>
                {ocrResults[key] && (
                  <span className="text-xs text-slate-400">
                    {ocrResults[key].confidence.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="border bg-black rounded mb-1">
                <img src={url} alt={key} className="max-w-full" style={{ imageRendering: 'pixelated' }} />
              </div>
              {ocrResults[key] && (
                <div className="text-xs font-mono bg-slate-700 p-1 rounded">
                  {ocrResults[key].text || '(empty)'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'binary' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs">Threshold:</label>
            <input
              type="range"
              min="0"
              max="255"
              value={threshold}
              onChange={(e) => onThresholdChange?.(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs font-mono w-12 text-right">{threshold}</span>
          </div>
          {binarizedUrl && (
            <div className="border bg-black rounded overflow-auto max-h-96">
              <img src={binarizedUrl} alt="binarized" className="max-w-full" />
            </div>
          )}
        </div>
      )}

      {tab === 'info' && (
        <div className="space-y-2">
          <div className="text-xs whitespace-pre-wrap font-mono bg-slate-800 p-2 rounded max-h-48 overflow-auto">
            {`OCR Raw:\n${ocrRaw ?? '—'}\n\nConfidence: ${confidence?.toFixed(1) ?? '—'}`}
          </div>
          {rects && (
            <div className="text-xs bg-slate-800 p-2 rounded max-h-48 overflow-auto">
              <div className="font-mono">
                <div className="text-green-400">NAME: {rects.nameRect.x}, {rects.nameRect.y}, {rects.nameRect.width}×{rects.nameRect.height}</div>
                <div className="text-red-400">COST: {rects.costRect.x}, {rects.costRect.y}, {rects.costRect.width}×{rects.costRect.height}</div>
                <div className="text-blue-400">MAIN1: {rects.main1Rect.x}, {rects.main1Rect.y}, {rects.main1Rect.width}×{rects.main1Rect.height}</div>
                <div className="text-blue-400">MAIN2: {rects.main2Rect.x}, {rects.main2Rect.y}, {rects.main2Rect.width}×{rects.main2Rect.height}</div>
                {rects.subRects.map((r, i) => (
                  <div key={i} className="text-yellow-400">
                    SUB{i + 1}: {r.x}, {r.y}, {r.width}×{r.height}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && roiConfig && (
        <div className="space-y-3 text-xs max-h-96 overflow-auto">
          {/* NAME */}
          <div className="bg-slate-800 p-2 rounded border border-green-500">
            <div className="font-semibold text-green-400 mb-2">NAME</div>
            <div className="grid grid-cols-2 gap-2">
              {renderCoordInput(roiConfig.name.x, (v) => handleConfigChange('name', 'x', v), 'x')}
              {renderCoordInput(roiConfig.name.y, (v) => handleConfigChange('name', 'y', v), 'y')}
              {renderCoordInput(roiConfig.name.w, (v) => handleConfigChange('name', 'w', v), 'w')}
              {renderCoordInput(roiConfig.name.h, (v) => handleConfigChange('name', 'h', v), 'h')}
            </div>
          </div>

          {/* COST */}
          <div className="bg-slate-800 p-2 rounded border border-red-500">
            <div className="font-semibold text-red-400 mb-2">COST</div>
            <div className="grid grid-cols-2 gap-2">
              {renderCoordInput(roiConfig.cost.x, (v) => handleConfigChange('cost', 'x', v), 'x')}
              {renderCoordInput(roiConfig.cost.y, (v) => handleConfigChange('cost', 'y', v), 'y')}
              {renderCoordInput(roiConfig.cost.w, (v) => handleConfigChange('cost', 'w', v), 'w')}
              {renderCoordInput(roiConfig.cost.h, (v) => handleConfigChange('cost', 'h', v), 'h')}
            </div>
          </div>

          {/* MAIN1 */}
          <div className="bg-slate-800 p-2 rounded border border-blue-500">
            <div className="font-semibold text-blue-400 mb-2">MAIN1</div>
            <div className="grid grid-cols-2 gap-2">
              {renderCoordInput(roiConfig.main1.x, (v) => handleConfigChange('main1', 'x', v), 'x')}
              {renderCoordInput(roiConfig.main1.y, (v) => handleConfigChange('main1', 'y', v), 'y')}
              {renderCoordInput(roiConfig.main1.w, (v) => handleConfigChange('main1', 'w', v), 'w')}
              {renderCoordInput(roiConfig.main1.h, (v) => handleConfigChange('main1', 'h', v), 'h')}
            </div>
          </div>

          {/* MAIN2 */}
          <div className="bg-slate-800 p-2 rounded border border-blue-500">
            <div className="font-semibold text-blue-400 mb-2">MAIN2</div>
            <div className="grid grid-cols-2 gap-2">
              {renderCoordInput(roiConfig.main2.x, (v) => handleConfigChange('main2', 'x', v), 'x')}
              {renderCoordInput(roiConfig.main2.y, (v) => handleConfigChange('main2', 'y', v), 'y')}
              {renderCoordInput(roiConfig.main2.w, (v) => handleConfigChange('main2', 'w', v), 'w')}
              {renderCoordInput(roiConfig.main2.h, (v) => handleConfigChange('main2', 'h', v), 'h')}
            </div>
          </div>

          {/* SUBS */}
          {roiConfig.subs.map((sub, i) => (
            <div key={i} className="bg-slate-800 p-2 rounded border border-yellow-500">
              <div className="font-semibold text-yellow-400 mb-2">SUB{i + 1}</div>
              <div className="grid grid-cols-2 gap-2">
                {renderCoordInput(sub.x, (v) => handleSubChange(i, 'x', v), 'x')}
                {renderCoordInput(sub.y, (v) => handleSubChange(i, 'y', v), 'y')}
                {renderCoordInput(sub.w, (v) => handleSubChange(i, 'w', v), 'w')}
                {renderCoordInput(sub.h, (v) => handleSubChange(i, 'h', v), 'h')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
