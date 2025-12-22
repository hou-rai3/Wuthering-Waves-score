import React from 'react';
import { ChevronDown } from 'lucide-react';
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
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-semibold w-4">{label}</span>
        <input
          type="number"
          min="0"
          max="1"
          step="0.001"
          defaultValue={value.toFixed(3)}
          onBlur={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="bg-slate-700/50 border border-slate-600 text-white px-2 py-1 rounded text-xs flex-1 focus:border-emerald-400 focus:outline-none transition-colors"
        />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-emerald-500"
      />
    </div>
  );

  return (
    <div className="relative z-10 card-styled p-6 border-2 border-purple-400/30 space-y-4">
      <div className="flex gap-3 items-center justify-between">
        <h2 className="text-lg font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent flex items-center gap-2">
          <ChevronDown size={20} />
          デバッグパネル
        </h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab('info')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'info'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            情報
          </button>
          <button
            onClick={() => setTab('rects')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'rects'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            ROI矩形
          </button>
          <button
            onClick={() => setTab('regions')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'regions'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            領域
          </button>
          <button
            onClick={() => setTab('binary')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'binary'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            二値化
          </button>
          <button
            onClick={() => setTab('config')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'config'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            設定
          </button>
        </div>
      </div>

      {tab === 'rects' && debugImage && (
        <div className="border border-slate-600 bg-black rounded-xl overflow-hidden shadow-xl">
          <img src={debugImage} alt="ROI rects" className="w-full" />
        </div>
      )}

      {tab === 'regions' && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {Object.entries(regionUrls).map(([key, url]) => (
            <div key={key} className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold uppercase bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                  {key.toUpperCase()}
                </span>
                {ocrResults[key] && (
                  <span className="text-xs bg-slate-700/50 px-2 py-1 rounded text-slate-300">
                    信頼度: {ocrResults[key].confidence.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="border border-slate-600 bg-black rounded-lg mb-3 overflow-hidden">
                <img src={url} alt={key} className="w-full" style={{ imageRendering: 'pixelated' }} />
              </div>
              {ocrResults[key] && (
                <div className="text-xs font-mono bg-slate-950/50 p-3 rounded border border-slate-700/50 text-slate-300 break-words">
                  {ocrResults[key].text || '(空)'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'binary' && (
        <div className="space-y-4">
          <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
            <label className="text-sm font-semibold text-slate-300 block mb-3">二値化閾値</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="255"
                value={threshold}
                onChange={(e) => onThresholdChange?.(parseInt(e.target.value))}
                className="flex-1 h-2 accent-emerald-500"
              />
              <div className="bg-slate-700/50 px-4 py-2 rounded font-mono font-bold text-emerald-300 min-w-12 text-center">
                {threshold}
              </div>
            </div>
          </div>
          {binarizedUrl && (
            <div className="border border-slate-600 bg-black rounded-xl overflow-hidden shadow-xl">
              <img src={binarizedUrl} alt="binarized" className="w-full" />
            </div>
          )}
        </div>
      )}

      {tab === 'info' && (
        <div className="space-y-4">
          <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
            <h3 className="text-sm font-bold text-slate-300 mb-3">OCR結果</h3>
            <div className="text-xs whitespace-pre-wrap font-mono bg-slate-950/50 p-3 rounded border border-slate-700/50 text-slate-300 max-h-32 overflow-y-auto">
              {ocrRaw || '—'}
            </div>
            <div className="mt-3 flex gap-4">
              <div className="text-xs">
                <span className="text-slate-400">信頼度:</span>
                <span className="ml-2 font-bold text-emerald-300">{confidence?.toFixed(1) ?? '—'}%</span>
              </div>
            </div>
          </div>
          {rects && (
            <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
              <h3 className="text-sm font-bold text-slate-300 mb-3">座標情報</h3>
              <div className="text-xs space-y-2 font-mono">
                <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded border border-green-500/30">
                  <span className="text-green-400">NAME</span>
                  <span className="text-slate-400">{rects.nameRect.x}, {rects.nameRect.y}, {rects.nameRect.width}×{rects.nameRect.height}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded border border-red-500/30">
                  <span className="text-red-400">COST</span>
                  <span className="text-slate-400">{rects.costRect.x}, {rects.costRect.y}, {rects.costRect.width}×{rects.costRect.height}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded border border-blue-500/30">
                  <span className="text-blue-400">MAIN1</span>
                  <span className="text-slate-400">{rects.main1Rect.x}, {rects.main1Rect.y}, {rects.main1Rect.width}×{rects.main1Rect.height}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded border border-blue-500/30">
                  <span className="text-blue-400">MAIN2</span>
                  <span className="text-slate-400">{rects.main2Rect.x}, {rects.main2Rect.y}, {rects.main2Rect.width}×{rects.main2Rect.height}</span>
                </div>
                {rects.subRects.map((r, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-slate-950/50 rounded border border-yellow-500/30">
                    <span className="text-yellow-400">SUB{i + 1}</span>
                    <span className="text-slate-400">{r.x}, {r.y}, {r.width}×{r.height}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && roiConfig && (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {/* NAME */}
          <div className="bg-slate-800/30 p-4 rounded-lg border-2 border-green-500/30 space-y-3">
            <h3 className="text-sm font-bold text-green-400">NAME領域</h3>
            <div className="grid grid-cols-2 gap-3">
              {renderCoordInput(roiConfig.name.x, (v) => handleConfigChange('name', 'x', v), 'X')}
              {renderCoordInput(roiConfig.name.y, (v) => handleConfigChange('name', 'y', v), 'Y')}
              {renderCoordInput(roiConfig.name.w, (v) => handleConfigChange('name', 'w', v), 'W')}
              {renderCoordInput(roiConfig.name.h, (v) => handleConfigChange('name', 'h', v), 'H')}
            </div>
          </div>

          {/* COST */}
          <div className="bg-slate-800/30 p-4 rounded-lg border-2 border-red-500/30 space-y-3">
            <h3 className="text-sm font-bold text-red-400">COST領域</h3>
            <div className="grid grid-cols-2 gap-3">
              {renderCoordInput(roiConfig.cost.x, (v) => handleConfigChange('cost', 'x', v), 'X')}
              {renderCoordInput(roiConfig.cost.y, (v) => handleConfigChange('cost', 'y', v), 'Y')}
              {renderCoordInput(roiConfig.cost.w, (v) => handleConfigChange('cost', 'w', v), 'W')}
              {renderCoordInput(roiConfig.cost.h, (v) => handleConfigChange('cost', 'h', v), 'H')}
            </div>
          </div>

          {/* MAIN1 */}
          <div className="bg-slate-800/30 p-4 rounded-lg border-2 border-blue-500/30 space-y-3">
            <h3 className="text-sm font-bold text-blue-400">MAIN1領域</h3>
            <div className="grid grid-cols-2 gap-3">
              {renderCoordInput(roiConfig.main1.x, (v) => handleConfigChange('main1', 'x', v), 'X')}
              {renderCoordInput(roiConfig.main1.y, (v) => handleConfigChange('main1', 'y', v), 'Y')}
              {renderCoordInput(roiConfig.main1.w, (v) => handleConfigChange('main1', 'w', v), 'W')}
              {renderCoordInput(roiConfig.main1.h, (v) => handleConfigChange('main1', 'h', v), 'H')}
            </div>
          </div>

          {/* MAIN2 */}
          <div className="bg-slate-800/30 p-4 rounded-lg border-2 border-cyan-500/30 space-y-3">
            <h3 className="text-sm font-bold text-cyan-400">MAIN2領域</h3>
            <div className="grid grid-cols-2 gap-3">
              {renderCoordInput(roiConfig.main2.x, (v) => handleConfigChange('main2', 'x', v), 'X')}
              {renderCoordInput(roiConfig.main2.y, (v) => handleConfigChange('main2', 'y', v), 'Y')}
              {renderCoordInput(roiConfig.main2.w, (v) => handleConfigChange('main2', 'w', v), 'W')}
              {renderCoordInput(roiConfig.main2.h, (v) => handleConfigChange('main2', 'h', v), 'H')}
            </div>
          </div>

          {/* SUBS */}
          {roiConfig.subs.map((sub, i) => (
            <div key={i} className="bg-slate-800/30 p-4 rounded-lg border-2 border-yellow-500/30 space-y-3">
              <h3 className="text-sm font-bold text-yellow-400">SUB{i + 1}領域</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderCoordInput(sub.x, (v) => handleSubChange(i, 'x', v), 'X')}
                {renderCoordInput(sub.y, (v) => handleSubChange(i, 'y', v), 'Y')}
                {renderCoordInput(sub.w, (v) => handleSubChange(i, 'w', v), 'W')}
                {renderCoordInput(sub.h, (v) => handleSubChange(i, 'h', v), 'H')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
