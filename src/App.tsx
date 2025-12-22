import React, { useMemo, useState } from 'react';
import { extractEchoRois } from './utils/imageProcessor';
import { useOcr } from './hooks/useOcr';
import { DebugPanel } from './components/DebugPanel';
import { loadRoiConfig, saveRoiConfig, type RoiConfig } from './utils/roiConfig';
import { cleanText, calculateScore, getScoreRank } from './utils/scoreCalculator';

type EchoScore = {
  name: string;
  cost: number;
  main1: string;
  main2: string;
  subs: string[];
  score: number;
  rank: string;
};

export default function App() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [debug, setDebug] = useState(false);
  const [ocrText, setOcrText] = useState<string>();
  const [confidence, setConfidence] = useState<number>();
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' } | null>(null);
  const [result, setResult] = useState<EchoScore | null>(null);
  const [debugImageUrl, setDebugImageUrl] = useState<string>();
  const [roiConfig, setRoiConfig] = useState<RoiConfig>(loadRoiConfig());
  const [threshold, setThreshold] = useState<number>(128);
  const [ocrResults, setOcrResults] = useState<Record<string, { text: string; confidence: number }>>({});
  const [selectedCharacter, setSelectedCharacter] = useState<string>('カルロッタ');

  const { recognize, ready, loading, error: ocrError } = useOcr();

  const showToast = React.useCallback((message: string, type: 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const extractNumber = (text: string): number => {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  };

  const rois = useMemo(() => {
    if (!imgEl) return null;
    try {
      const result = extractEchoRois(imgEl, roiConfig, threshold);
      
      // ROI矩形枠を描画したデバッグ画像を作成
      if (debug) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imgEl, 0, 0);
        
        // 矩形枠を描画
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 3;
        
        // Name
        ctx.strokeRect(result.rects.nameRect.x, result.rects.nameRect.y, result.rects.nameRect.width, result.rects.nameRect.height);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(result.rects.nameRect.x, result.rects.nameRect.y, result.rects.nameRect.width, result.rects.nameRect.height);
        ctx.fillStyle = '#0f0';
        ctx.font = '16px Arial';
        ctx.fillText('NAME', result.rects.nameRect.x + 5, result.rects.nameRect.y + 20);
        
        // Cost
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.strokeRect(result.rects.costRect.x, result.rects.costRect.y, result.rects.costRect.width, result.rects.costRect.height);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(result.rects.costRect.x, result.rects.costRect.y, result.rects.costRect.width, result.rects.costRect.height);
        ctx.fillStyle = '#f00';
        ctx.fillText('COST', result.rects.costRect.x + 5, result.rects.costRect.y + 20);
        
        // Main1
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
        ctx.strokeRect(result.rects.main1Rect.x, result.rects.main1Rect.y, result.rects.main1Rect.width, result.rects.main1Rect.height);
        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
        ctx.fillRect(result.rects.main1Rect.x, result.rects.main1Rect.y, result.rects.main1Rect.width, result.rects.main1Rect.height);
        ctx.fillStyle = '#00f';
        ctx.fillText('MAIN1', result.rects.main1Rect.x + 5, result.rects.main1Rect.y + 20);
        
        // Main2
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.strokeRect(result.rects.main2Rect.x, result.rects.main2Rect.y, result.rects.main2Rect.width, result.rects.main2Rect.height);
        ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
        ctx.fillRect(result.rects.main2Rect.x, result.rects.main2Rect.y, result.rects.main2Rect.width, result.rects.main2Rect.height);
        ctx.fillStyle = '#09f';
        ctx.fillText('MAIN2', result.rects.main2Rect.x + 5, result.rects.main2Rect.y + 20);
        
        // Subs
        result.rects.subRects.forEach((rect, i) => {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.fillStyle = '#ff0';
          ctx.fillText(`SUB${i + 1}`, rect.x + 5, rect.y + 20);
        });
        
        setDebugImageUrl(canvas.toDataURL());
      }
      
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image processing failed';
      showToast(msg, 'error');
      return null;
    }
  }, [imgEl, debug, roiConfig, threshold, showToast]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.[0]) return;

    try {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImgEl(img);
        showToast(`画像を読み込みました: ${file.name}`, 'info');
      };
      img.onerror = () => {
        showToast('画像の読み込みに失敗しました', 'error');
      };
      img.src = url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ファイル処理に失敗しました', 'error');
    }
  };

  const runOcr = React.useCallback(async () => {
    if (!rois) {
      showToast('画像が読み込まれていません', 'error');
      return;
    }

    try {
      showToast('OCR処理中...', 'info');
      const results: Record<string, { text: string; confidence: number }> = {};

      // OCR for name
      const nameRes = await recognize(rois.regions.name);
      results.name = nameRes;

      // OCR for cost
      const costRes = await recognize(rois.regions.cost);
      results.cost = costRes;

      // OCR for main stat (2行)
      const main1Res = await recognize(rois.regions.main1);
      const main2Res = await recognize(rois.regions.main2);
      results.main1 = main1Res;
      results.main2 = main2Res;
      setOcrText(main1Res.text + '\n' + main2Res.text);
      setConfidence((main1Res.confidence + main2Res.confidence) / 2);

      // OCR for subs
      for (let i = 0; i < rois.regions.subs.length; i++) {
        const subRes = await recognize(rois.regions.subs[i]);
        results[`sub${i + 1}`] = subRes;
      }

      setOcrResults(results);
      showToast('OCR完了', 'info');

      // テキスト整形
      const cleanedMain1 = cleanText(main1Res.text);
      const cleanedMain2 = cleanText(main2Res.text);
      const cleanedSubs = rois.regions.subs.map((_, i) => cleanText(results[`sub${i + 1}`].text));

      // スコア計算
      const characterName = cleanText(nameRes.text);
      const score = calculateScore(cleanedMain1, cleanedMain2, cleanedSubs, selectedCharacter);
      const rank = getScoreRank(score);
      
      setResult({
        name: characterName,
        cost: extractNumber(costRes.text),
        main1: cleanedMain1,
        main2: cleanedMain2,
        subs: cleanedSubs,
        score,
        rank,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR処理に失敗しました';
      showToast(msg, 'error');
    }
  }, [rois, recognize, showToast]);

  // 画像読み込み後に自動でOCR実行
  React.useEffect(() => {
    if (imgEl && rois && ready && !loading) {
      runOcr();
    }
  }, [imgEl, rois, ready, loading, runOcr]);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = e.clipboardData?.files;
    if (files?.length) {
      handleFiles(files);
      e.preventDefault();
    }
  };

  React.useEffect(() => {
    if (ocrError) {
      showToast(`OCR error: ${ocrError}`, 'error');
    }
  }, [ocrError, showToast]);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg ${
            toast.type === 'error'
              ? 'bg-red-600'
              : 'bg-emerald-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold">鳴潮 自動スコア計算器</h1>
        <span className="text-xs text-slate-400">音骸ステータス解析</span>

        <div className="flex gap-2 ml-auto">
          <select
            value={selectedCharacter}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            className="px-3 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm"
          >
            <option value="カルロッタ">カルロッタ</option>
            <option value="デフォルト">デフォルト</option>
          </select>
          <button
            onClick={() => setDebug((v) => !v)}
            className="px-3 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm"
          >
            {debug ? 'デバッグOFF' : 'デバッグON'}
          </button>
          <button
            disabled={!ready || !rois || loading}
            onClick={runOcr}
            className="px-3 py-1 rounded bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm hover:bg-emerald-500"
          >
            {loading ? '読込中...' : 'OCR実行'}
          </button>
        </div>
      </header>

      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-slate-500 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="space-y-2">
          <p className="text-base font-medium">画像をドラッグ&ドロップ</p>
          <p className="text-xs text-slate-400">または Ctrl+V でペースト</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            className="inline-block px-3 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm cursor-pointer"
          >
            ファイルを選択
          </label>
        </div>
      </div>

      {/* Debug Panel */}
      <DebugPanel
        show={debug}
        binarized={rois?.binarized}
        debugImage={debugImageUrl}
        ocrRaw={ocrText}
        confidence={confidence}
        rects={rois?.rects}
        roiConfig={roiConfig}
        regions={rois?.regions}
        threshold={threshold}
        ocrResults={ocrResults}
        onConfigChange={(newConfig) => {
          setRoiConfig(newConfig);
          saveRoiConfig(newConfig);
        }}
        onThresholdChange={setThreshold}
      />

      {/* Result Display */}
      {result && (
        <div className="rounded border-2 border-emerald-500 bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <h2 className="text-xl font-semibold">{result.name}</h2>
            <span className="text-base px-3 py-1 bg-slate-800 rounded font-semibold">COST {result.cost}</span>
          </div>
          
          {/* スコア - 大きく表示 */}
          <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-6 rounded-lg text-center">
            <div className="text-sm text-slate-400 mb-2">総合スコア</div>
            <div className="flex items-center justify-center gap-4">
              <div className="text-6xl font-bold text-emerald-400">{result.score}</div>
              <div className="text-3xl font-bold text-yellow-400">{result.rank}</div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400 mb-2">メインステータス</div>
              <div className="text-base font-mono">{result.main1}</div>
              <div className="text-sm font-mono text-slate-500">{result.main2}</div>
            </div>
            
            {result.subs.length > 0 && (
              <div className="bg-slate-800 p-3 rounded">
                <div className="text-xs text-slate-400 mb-2">サブステータス</div>
                <div className="space-y-1">
                  {result.subs.map((sub, i) => (
                    <div key={i} className="text-base font-mono">
                      {i + 1}. {sub}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 認識領域の表示 */}
      {result && debugImageUrl && !debug && (
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h3 className="text-sm font-semibold mb-2 text-slate-400">認識領域</h3>
          <div className="border bg-black rounded overflow-auto max-h-64">
            <img src={debugImageUrl} alt="認識領域" className="max-w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
