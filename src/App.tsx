import React, { useMemo, useState } from 'react';
import { extractEchoRois } from './utils/imageProcessor';
import { useOcr } from './hooks/useOcr';
import { DebugPanel } from './components/DebugPanel';
import { loadRoiConfig, saveRoiConfig, type RoiConfig } from './utils/roiConfig';
import { cleanText, getScoreRank, calculateScoreWithBreakdown, extractPercentage } from './utils/scoreCalculator';
import { Upload, Zap } from 'lucide-react';

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
  const [showDetails, setShowDetails] = useState(false);

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
      
      if (debug) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imgEl, 0, 0);
        
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 3;
        
        ctx.strokeRect(result.rects.nameRect.x, result.rects.nameRect.y, result.rects.nameRect.width, result.rects.nameRect.height);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(result.rects.nameRect.x, result.rects.nameRect.y, result.rects.nameRect.width, result.rects.nameRect.height);
        ctx.fillStyle = '#0f0';
        ctx.font = '16px Arial';
        ctx.fillText('NAME', result.rects.nameRect.x + 5, result.rects.nameRect.y + 20);
        
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.strokeRect(result.rects.costRect.x, result.rects.costRect.y, result.rects.costRect.width, result.rects.costRect.height);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(result.rects.costRect.x, result.rects.costRect.y, result.rects.costRect.width, result.rects.costRect.height);
        ctx.fillStyle = '#f00';
        ctx.fillText('COST', result.rects.costRect.x + 5, result.rects.costRect.y + 20);
        
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
        ctx.strokeRect(result.rects.main1Rect.x, result.rects.main1Rect.y, result.rects.main1Rect.width, result.rects.main1Rect.height);
        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
        ctx.fillRect(result.rects.main1Rect.x, result.rects.main1Rect.y, result.rects.main1Rect.width, result.rects.main1Rect.height);
        ctx.fillStyle = '#00f';
        ctx.fillText('MAIN1', result.rects.main1Rect.x + 5, result.rects.main1Rect.y + 20);
        
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.strokeRect(result.rects.main2Rect.x, result.rects.main2Rect.y, result.rects.main2Rect.width, result.rects.main2Rect.height);
        ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
        ctx.fillRect(result.rects.main2Rect.x, result.rects.main2Rect.y, result.rects.main2Rect.width, result.rects.main2Rect.height);
        ctx.fillStyle = '#09f';
        ctx.fillText('MAIN2', result.rects.main2Rect.x + 5, result.rects.main2Rect.y + 20);
        
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

      const nameRes = await recognize(rois.regions.name);
      results.name = nameRes;

      const costRes = await recognize(rois.regions.cost);
      results.cost = costRes;

      const main1Res = await recognize(rois.regions.main1);
      const main2Res = await recognize(rois.regions.main2);
      results.main1 = main1Res;
      results.main2 = main2Res;
      setOcrText(main1Res.text + '\n' + main2Res.text);
      setConfidence((main1Res.confidence + main2Res.confidence) / 2);

      for (let i = 0; i < rois.regions.subs.length; i++) {
        const subRes = await recognize(rois.regions.subs[i]);
        results[`sub${i + 1}`] = subRes;
      }

      setOcrResults(results);
      showToast('OCR完了', 'info');

      const cleanedMain1 = cleanText(main1Res.text);
      const cleanedMain2 = cleanText(main2Res.text);
      const cleanedSubs = rois.regions.subs.map((_, i) => cleanText(results[`sub${i + 1}`].text));

      const allStatNames = [cleanedMain1, ...cleanedSubs];
      const allPercentages = [
        extractPercentage(main1Res.text),
        ...rois.regions.subs.map((_, i) => extractPercentage(results[`sub${i + 1}`].text)),
      ];

      const characterName = cleanText(nameRes.text);
      const scoreDetails = calculateScoreWithBreakdown(allStatNames, allPercentages, selectedCharacter);
      const rank = getScoreRank(scoreDetails.score);
      
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
  }, [rois, recognize, showToast, selectedCharacter]);

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

  const getRankColor = (rank: string) => {
    switch(rank) {
      case 'SS': return 'from-red-400 to-orange-400';
      case 'S': return 'from-orange-400 to-yellow-400';
      case 'A': return 'from-yellow-400 to-lime-400';
      case 'B': return 'from-lime-400 to-green-400';
      default: return 'from-green-400 to-emerald-400';
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-lime-100 via-yellow-50 to-green-100 text-slate-900 p-4 md:p-8 space-y-6"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-lime-300/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-yellow-200/20 rounded-full blur-3xl animate-float"></div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div
          className={`fixed top-6 right-6 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-md border z-50 animate-in fade-in slide-in-from-right ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-400 text-red-700'
              : 'bg-lime-50 border-lime-400 text-lime-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header - Compact */}
      <header className="relative z-10 space-y-2 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-1 h-6 bg-gradient-to-b from-lime-500 to-green-600 rounded-full shadow-lg"></div>
            </div>
            <div>
              <h1 className="text-3xl font-black text-lime-800" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '-0.02em' }}>鳴潮</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">キャラクター選択</span>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white border-2 border-lime-400 hover:border-lime-500 text-slate-800 text-xs font-bold transition-all shadow-md"
            >
              <option value="カルロッタ">カルロッタ</option>
              <option value="デフォルト">デフォルト</option>
            </select>
            <button
              onClick={() => setDebug((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                debug
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-2 border-purple-600 text-white'
                  : 'bg-white border-2 border-lime-400 text-lime-800'
              }`}
            >
              {debug ? '🔧 デバッグON' : '◎ デバッグ'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-700 font-semibold ml-2">音骸スコア自動計算ツール</p>
      </header>

      {/* Upload Area or Image Preview - Compact */}
      {!imgUrl ? (
        <div
          className="relative z-10 gradient-border p-4 text-center cursor-pointer hover:border-lime-500 transition-all group overflow-hidden h-64 md:h-80 flex flex-col items-center justify-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="absolute inset-0 bg-gradient-wave opacity-30 group-hover:opacity-50 transition-opacity"></div>
          <div className="relative space-y-3 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lime-200 to-green-200 border-2 border-lime-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-lime-700" />
              </div>
            </div>
            <div>
              <p className="text-sm font-black mb-1 text-lime-800">画像をドラッグ&ドロップ</p>
              <p className="text-xs text-slate-600">Ctrl+V またはファイル選択</p>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="inline-block px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-bold cursor-pointer hover:bg-purple-600 transition-all shadow-md"
            >
              📁 選択
            </label>
          </div>
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-3 gap-4 h-96">
          {/* Left: Image */}
          <div className="card-styled p-3 border-2 border-lime-400 shadow-xl col-span-1 overflow-hidden">
            <img 
              src={imgUrl} 
              alt="Preview" 
              className="w-full h-full object-contain"
            />
          </div>

          {/* Right: Results */}
          {result ? (
            <div className="col-span-2 space-y-3">
              {/* Character & Score Summary */}
              <div className="card-styled p-4 border-2 border-lime-400 shadow-xl h-1/2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-xl font-black text-lime-800" style={{ fontFamily: "'Playfair Display', serif" }}>
                      {result.name}
                    </h2>
                    <p className="text-xs text-slate-500">COST {result.cost}</p>
                  </div>
                  <div className={`px-6 py-3 rounded-2xl bg-gradient-to-br ${getRankColor(result.rank)} shadow-lg border border-white/60`}>
                    <div className="text-4xl font-black text-white" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '-0.03em' }}>
                      {result.rank}
                    </div>
                  </div>
                </div>
                <div className="text-3xl font-black text-lime-800 leading-none" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '-0.03em' }}>
                  {result.score}
                </div>
              </div>

              {/* Stats Compact */}
              <div className="card-styled p-3 border-2 border-lime-400 shadow-xl h-1/2 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-lime-50 p-2 rounded-2xl border-2 border-lime-300">
                    <div className="font-bold text-lime-800">{result.main1}</div>
                    {result.scoreDetails?.breakdown[0] && (
                      <div className="text-lime-700 font-black">{result.scoreDetails.breakdown[0].percentage}%</div>
                    )}
                  </div>
                  {result.subs.map((sub, i) => {
                    const breakdownItem = result.scoreDetails?.breakdown[i + 1];
                    return (
                      <div key={i} className="bg-lime-50 p-2 rounded-2xl border-2 border-lime-300">
                        <div className="font-bold text-green-800 text-xs">{sub}</div>
                        {breakdownItem && (
                          <div className="text-lime-700 font-black text-xs">{breakdownItem.percentage}%</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="col-span-2 card-styled p-6 border-2 border-lime-300 shadow-xl flex items-center justify-center">
              <p className="text-sm text-slate-600 font-semibold">OCR実行後に結果が表示されます</p>
            </div>
          )}
        </div>
      )}

      {/* OCR Control */}
      {imgUrl && (
        <div className="relative z-10 flex justify-center">
          <button
            disabled={!ready || !rois || loading}
            onClick={runOcr}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Zap size={20} />
            {loading ? 'OCR処理中...' : 'OCR実行'}
          </button>
        </div>
      )}

      {/* Score Details Toggle - Hidden when no result */}
      {result && (
        <div className="relative z-10 mt-4 space-y-2">
          {/* Expandable Details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold text-xs hover:shadow-lg transition-all flex items-center justify-between"
          >
            <span>📊 スコア詳細情報</span>
            <span>{showDetails ? '▼' : '▶'}</span>
          </button>

          {showDetails && (
            <div className="card-styled p-4 border-2 border-lime-300 shadow-xl space-y-3 max-h-96 overflow-y-auto">
              {/* Full score breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-lime-50 p-2 rounded-lg border border-lime-300">
                  <div className="font-bold text-lime-800">{result.main1}</div>
                  {result.scoreDetails?.breakdown[0] && (
                    <div className="text-lg font-black text-lime-700">{result.scoreDetails.breakdown[0].percentage}%</div>
                  )}
                </div>
                {result.subs.map((sub, i) => {
                  const breakdownItem = result.scoreDetails?.breakdown[i + 1];
                  return (
                    <div key={i} className="bg-lime-50 p-2 rounded-lg border border-lime-300">
                      <div className="font-bold text-green-800">{sub}</div>
                      {breakdownItem && (
                        <div className="text-lg font-black text-lime-700">{breakdownItem.percentage}%</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recognition Text */}
              {result.scoreDetails?.rawText && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 text-xs">
                  <p className="font-bold text-slate-700 mb-2">✓ 認識テキスト</p>
                  <p className="text-slate-600 leading-relaxed font-mono text-xs break-all">
                    {result.scoreDetails.rawText}
                  </p>
                </div>
              )}

              {/* Calculation Details */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 text-xs">
                <p className="font-bold text-slate-700 mb-2">💡 計算詳細</p>
                <div className="space-y-1 text-slate-600 font-mono text-xs">
                  <p>スコア: {result.score}</p>
                  <p>ランク: {result.rank}</p>
                  <p>キャラクター: {result.name}</p>
                  <p>コスト: {result.cost}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset Button */}
      {imgUrl && (
        <>
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
          <div className="relative z-10 flex justify-center mt-4">
            <button
              onClick={() => {
                setImgUrl(null);
                setImgEl(null);
                setResult(null);
                setDebugImageUrl(undefined);
              }}
              className="btn-secondary"
            >
              ↻ 新しい画像を読み込む
            </button>
          </div>
        </>
      )}
    </div>
  );
}
