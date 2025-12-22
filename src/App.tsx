import React, { useMemo, useState } from 'react';
import { extractEchoRois } from './utils/imageProcessor';
import { useOcr } from './hooks/useOcr';
import { DebugPanel } from './components/DebugPanel';
import { loadRoiConfig, saveRoiConfig, type RoiConfig } from './utils/roiConfig';
import { cleanText, getScoreRank, calculateScoreWithBreakdown, extractPercentage } from './utils/scoreCalculator';

type EchoScore = {
  name: string;
  cost: number;
  main1: string;
  main2: string;
  subs: string[];
  score: number;
  rank: string;
  scoreDetails?: any;
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
  const [imgUrl, setImgUrl] = useState<string | null>(null);

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
      setImgUrl(url);
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

      // OCR生テキストから%値を直接抽出（cleanTextする前）
      const allStatNames = [cleanedMain1, ...cleanedSubs];
      const allPercentages = [
        extractPercentage(main1Res.text),
        ...rois.regions.subs.map((_, i) => extractPercentage(results[`sub${i + 1}`].text)),
      ];

      // スコア計算
      const characterName = cleanText(nameRes.text);
      const scoreDetails = calculateScoreWithBreakdown(allStatNames, allPercentages, selectedCharacter);
      const rank = getScoreRank(scoreDetails.score);
      
      // 丸め込みされたステータス名を取得
      const correctedMain1 = scoreDetails.breakdown[0]?.statName || cleanedMain1;
      const correctedSubs = scoreDetails.breakdown.slice(1).map(item => item.statName);
      
      setResult({
        name: characterName,
        cost: extractNumber(costRes.text),
        main1: correctedMain1,
        main2: cleanedMain2,
        subs: correctedSubs,
        score: scoreDetails.score,
        rank,
        scoreDetails,
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
      className="min-h-screen bg-gradient-to-br from-amber-50 via-lime-50 to-emerald-50 text-slate-800 p-4 space-y-6"
      onPaste={handlePaste}
      tabIndex={0}
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(132, 204, 22, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(132, 204, 22, 0.05) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px'
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-2xl backdrop-blur-sm border-2 animate-slide-in ${
            toast.type === 'error'
              ? 'bg-red-100/90 border-red-400 text-red-800'
              : 'bg-lime-100/90 border-lime-400 text-lime-900'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md shadow-xl border-b-4 border-lime-300 p-4 mb-6 rounded-2xl z-[100]">
        <div className="absolute inset-0 bg-gradient-to-r from-lime-100/20 to-emerald-100/20 rounded-2xl"></div>
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-lime-600 to-emerald-600 bg-clip-text text-transparent">
              鳴潮 自動スコア計算器
            </h1>
            <p className="text-sm text-slate-600 mt-1">音骸ステータス解析</p>
          </div>
          
          <div className="flex gap-3 items-center">
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white border-2 border-lime-300 hover:border-lime-400 text-slate-800 font-medium shadow-sm transition-all"
            >
              <option value="カルロッタ">カルロッタ</option>
              <option value="デフォルト">デフォルト</option>
            </select>
            <button
              onClick={() => setDebug((v) => !v)}
              className="px-4 py-2 rounded-xl bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700 font-medium shadow-sm transition-all"
            >
              {debug ? 'デバッグOFF' : 'デバッグON'}
            </button>
            <button
              disabled={!ready || !rois || loading}
              onClick={runOcr}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-lime-500 to-emerald-500 hover:from-lime-600 hover:to-emerald-600 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold shadow-lg transition-all transform hover:scale-105"
            >
              {loading ? '読込中...' : 'OCR実行'}
            </button>
          </div>
        </div>
      </header>

      {/* Upload Area or Image Preview */}
      {!imgUrl ? (
        <div
          className="relative border-4 border-dashed border-lime-300 rounded-2xl p-12 text-center hover:border-lime-400 transition-all bg-white/40 backdrop-blur-sm shadow-lg overflow-hidden group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-lime-100/30 to-emerald-100/30 group-hover:from-lime-200/40 group-hover:to-emerald-200/40 transition-all"></div>
          <div className="relative space-y-4">
            <div className="inline-block p-4 bg-lime-100 rounded-full mb-2">
              <svg className="w-12 h-12 text-lime-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-slate-700">画像をドラッグ&ドロップ</p>
            <p className="text-sm text-slate-500">または Ctrl+V でペースト</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-lime-500 to-emerald-500 hover:from-lime-600 hover:to-emerald-600 text-white font-bold cursor-pointer shadow-lg transition-all transform hover:scale-105"
            >
              ファイルを選択
            </label>
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl border-4 border-lime-300 bg-white/60 backdrop-blur-sm p-6 shadow-xl overflow-hidden z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-lime-50/50 to-emerald-50/50"></div>
          <div className="relative h-80 flex justify-center items-center">
            <img 
              src={imgUrl} 
              alt="Preview" 
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}

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
        <div className="relative rounded-2xl border-4 border-lime-300 bg-white/70 backdrop-blur-md p-8 space-y-6 shadow-2xl overflow-hidden animate-fade-in z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-lime-50/50 to-emerald-50/50"></div>
          
          <div className="relative flex items-center justify-between border-b-2 border-lime-200 pb-4">
            <h2 className="text-2xl font-bold text-slate-800">{result.name}</h2>
            <span className="text-lg px-4 py-2 bg-gradient-to-r from-lime-500 to-emerald-500 text-white rounded-xl font-bold shadow-lg">COST {result.cost}</span>
          </div>
          
          {/* スコア - 大きく表示 */}
          <div className="relative bg-gradient-to-br from-lime-100 via-emerald-100 to-lime-100 p-12 rounded-3xl text-center border-4 border-lime-400 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-200/30 to-emerald-200/30 rounded-3xl animate-pulse"></div>
            <div className="relative">
              <div className="text-sm text-slate-600 mb-4 font-bold uppercase tracking-widest">総合スコア</div>
              <div className="flex items-center justify-center gap-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-lime-400 to-emerald-400 blur-2xl opacity-50"></div>
                  <div className="relative text-9xl font-black bg-gradient-to-r from-lime-600 via-emerald-600 to-lime-600 bg-clip-text text-transparent drop-shadow-2xl">{result.score}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-6xl font-black text-yellow-500 drop-shadow-lg">{result.rank}</div>
                  <div className="text-sm text-slate-600 font-semibold mt-2">ランク</div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-lime-50/50 to-emerald-50/50"></div>
          
          <div className="relative flex items-center justify-between border-b-2 border-lime-200 pb-4">
            <h2 className="text-2xl font-bold text-slate-800">{result.name}</h2>
            <span className="text-lg px-4 py-2 bg-gradient-to-r from-lime-500 to-emerald-500 text-white rounded-xl font-bold shadow-lg">COST {result.cost}</span>
          </div>
          
          {/* スコア - より大きく強調表示 */}
          <div className="relative bg-gradient-to-br from-lime-100 via-emerald-100 to-lime-100 p-12 rounded-3xl text-center border-4 border-lime-400 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-200/30 to-emerald-200/30 rounded-3xl animate-pulse"></div>
            <div className="relative">
              <div className="text-sm text-slate-600 mb-4 font-bold uppercase tracking-widest">総合スコア</div>
              <div className="flex items-center justify-center gap-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-lime-400 to-emerald-400 blur-2xl opacity-50"></div>
                  <div className="relative text-9xl font-black bg-gradient-to-r from-lime-600 via-emerald-600 to-lime-600 bg-clip-text text-transparent drop-shadow-2xl">{result.score}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-6xl font-black text-yellow-500 drop-shadow-lg">{result.rank}</div>
                  <div className="text-sm text-slate-600 font-semibold mt-2">ランク</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative space-y-4">
            <div className="bg-white/80 backdrop-blur-sm p-5 rounded-xl border-2 border-lime-200 shadow-md">
              <div className="text-xs text-slate-600 mb-3 font-bold uppercase tracking-wider">メインステータス</div>
              <div className="text-lg font-bold text-slate-800">{result.main1}</div>
              <div className="text-sm font-mono text-slate-600 mt-1">{result.main2}</div>
            </div>
            
            {result.subs.length > 0 && (
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-xl border-2 border-lime-200 shadow-md">
                <div className="text-xs text-slate-600 mb-3 font-bold uppercase tracking-wider">サブステータス</div>
                <div className="space-y-2">
                  {result.subs.map((sub, i) => (
                    <div key={i} className="text-base font-semibold text-slate-700 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-lime-500 text-white text-xs font-bold">{i + 1}</span>
                      {sub}
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

      {/* スコア計算詳細 */}
      {result && debug && result.scoreDetails && (
        <div className="rounded border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400">計算式の詳細</h3>
          <div className="space-y-2 font-mono text-sm">
            {result.scoreDetails.breakdown.map((item: any, idx: number) => {
              const label = item.type === 'main1' ? 'メイン' : `サブ${item.index}`;
              return (
                <div key={idx} className="bg-slate-800 p-2 rounded flex justify-between items-center">
                  <span className="text-slate-300">
                    {label} <span className="text-slate-400">({item.statName})</span>
                  </span>
                  <span className="text-emerald-400">
                    {item.percentage}% × {item.weight.toFixed(2)} = <strong>{item.contribution}</strong>
                  </span>
                </div>
              );
            })}
            <div className="bg-slate-700 p-2 rounded flex justify-between items-center border-t border-slate-600 mt-3 pt-3">
              <span className="text-slate-100 font-semibold">合計スコア</span>
              <span className="text-yellow-400 font-bold text-lg">{result.score}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
