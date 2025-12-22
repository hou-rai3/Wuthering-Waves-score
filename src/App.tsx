import React, { useMemo, useState } from 'react';
import { extractEchoRois } from './utils/imageProcessor';
import { useOcr } from './hooks/useOcr';
import { DebugPanel } from './components/DebugPanel';
import { loadRoiConfig, saveRoiConfig, type RoiConfig } from './utils/roiConfig';
import { cleanText, getScoreRank, calculateScoreWithBreakdown, extractPercentage } from './utils/scoreCalculator';
import { Upload, Sparkles, Zap, Shield } from 'lucide-react';

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
  }, [rois, recognize, showToast]);

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
      case 'SS': return 'from-red-500 to-orange-500';
      case 'S': return 'from-orange-500 to-yellow-500';
      case 'A': return 'from-yellow-500 to-green-500';
      case 'B': return 'from-green-500 to-blue-500';
      default: return 'from-blue-500 to-purple-500';
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950 text-slate-100 p-4 md:p-8 space-y-6"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div
          className={`fixed top-6 right-6 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-md border z-50 animate-in fade-in slide-in-from-right ${
            toast.type === 'error'
              ? 'bg-red-500/20 border-red-400/50 text-red-200'
              : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 bg-gradient-to-b from-emerald-400 to-cyan-400 rounded-full"></div>
              <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">鳴潮</h1>
            </div>
            <p className="text-sm md:text-base text-slate-400 flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-400" />
              音骸スコア自動計算ツール
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:gap-3">
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="px-4 py-2 rounded-lg bg-slate-800/50 border border-emerald-400/30 hover:border-emerald-400/60 text-slate-100 text-sm font-medium transition-all backdrop-blur-sm"
            >
              <option value="カルロッタ">カルロッタ</option>
              <option value="デフォルト">デフォルト</option>
            </select>
            <button
              onClick={() => setDebug((v) => !v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all backdrop-blur-sm ${
                debug
                  ? 'bg-purple-500/30 border border-purple-400/60 text-purple-200 hover:bg-purple-500/40'
                  : 'bg-slate-800/50 border border-slate-600/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {debug ? '🔧 デバッグ' : '◎ デバッグ'}
            </button>
          </div>
        </div>
      </header>

      {/* Upload Area or Image Preview */}
      {!imgUrl ? (
        <div
          className="relative z-10 gradient-border p-8 md:p-12 text-center cursor-pointer hover:border-emerald-400/50 transition-all group overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="absolute inset-0 bg-gradient-wave opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative space-y-4">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 border border-emerald-400/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold mb-2 text-emerald-300">画像をドラッグ&ドロップ</p>
              <p className="text-sm text-slate-400">または Ctrl+V でペースト / ファイルを選択</p>
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
              className="inline-block btn-primary cursor-pointer"
            >
              📁 ファイルを選択
            </label>
          </div>
        </div>
      ) : (
        <div className="relative z-10 card-styled p-6 md:p-8">
          <div className="relative rounded-xl overflow-hidden bg-slate-950/50 border border-emerald-400/20">
            <div className="aspect-video md:aspect-auto md:h-96 flex justify-center items-center">
              <img 
                src={imgUrl} 
                alt="Preview" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
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
        <div className="relative z-10 space-y-6">
          {/* Character Info Card */}
          <div className="card-styled p-6 md:p-8 border-2 border-emerald-400/40">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent mb-2">
                  {result.name}
                </h2>
                <div className="flex items-center gap-2 text-slate-400">
                  <Shield size={16} />
                  <span className="text-sm">音骸スコア解析完了</span>
                </div>
              </div>
              <div className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 border border-emerald-400/20 text-center">
                <div className="text-xs text-slate-400 mb-1">COST</div>
                <div className="text-2xl font-black text-emerald-300">{result.cost}</div>
              </div>
            </div>
          </div>

          {/* Score Display - Main Focus */}
          <div className={`relative z-10 card-styled p-8 md:p-12 border-2 bg-gradient-to-br ${getRankColor(result.rank)}/10 border-${getRankColor(result.rank).split('-')[1]}-400/40 overflow-hidden group`}>
            <div className="absolute inset-0 bg-gradient-wave opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1 text-center md:text-left">
                <p className="text-sm text-slate-400 mb-3 font-semibold">総合スコア</p>
                <div className="text-6xl md:text-7xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent animate-pulse">
                  {result.score}
                </div>
              </div>
              <div className={`px-10 py-6 rounded-2xl bg-gradient-to-br ${getRankColor(result.rank)} shadow-2xl transform group-hover:scale-110 transition-transform`}>
                <div className="text-6xl md:text-7xl font-black text-white drop-shadow-lg">{result.rank}</div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Main Stats */}
            <div className="card-styled p-6 md:p-8 border border-emerald-400/30">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-400/20">
                <Sparkles size={18} className="text-emerald-400" />
                <h3 className="text-lg font-bold text-emerald-300">メインステータス</h3>
              </div>
              <div className="space-y-3">
                <div className="bg-slate-950/50 p-4 rounded-lg border border-emerald-400/20 hover:border-emerald-400/40 transition-all">
                  <div className="text-xs text-slate-500 mb-2">ステータス1</div>
                  <div className="text-lg font-bold text-cyan-300 font-mono">{result.main1}</div>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-lg border border-emerald-400/20 hover:border-emerald-400/40 transition-all">
                  <div className="text-xs text-slate-500 mb-2">ステータス2</div>
                  <div className="text-base font-semibold text-emerald-300 font-mono">{result.main2}</div>
                </div>
              </div>
            </div>

            {/* Sub Stats */}
            {result.subs.length > 0 && (
              <div className="card-styled p-6 md:p-8 border border-emerald-400/30">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-400/20">
                  <Zap size={18} className="text-cyan-400" />
                  <h3 className="text-lg font-bold text-emerald-300">サブステータス</h3>
                </div>
                <div className="space-y-2">
                  {result.subs.map((sub, i) => (
                    <div key={i} className="bg-slate-950/50 p-3 rounded-lg border border-emerald-400/20 hover:border-emerald-400/40 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Sub {i + 1}</span>
                        <span className="font-mono font-semibold text-cyan-300">{sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Score Breakdown */}
          {result.scoreDetails && (
            <div className="card-styled p-6 md:p-8 border border-slate-700/50">
              <h3 className="text-lg font-bold text-slate-300 mb-4">スコア計算詳細</h3>
              <div className="space-y-2 font-mono text-sm">
                {result.scoreDetails.breakdown.map((item: any, idx: number) => {
                  const label = item.type === 'main1' ? 'メイン' : `サブ${item.index}`;
                  return (
                    <div key={idx} className="bg-slate-950/50 p-3 rounded-lg flex justify-between items-center border border-slate-700/30 hover:border-slate-700/60 transition-all">
                      <span className="text-slate-300">
                        {label} <span className="text-slate-500">({item.statName})</span>
                      </span>
                      <span className="text-emerald-400">
                        {item.percentage}% × {item.weight.toFixed(2)} = <strong>{item.contribution}</strong>
                      </span>
                    </div>
                  );
                })}
                <div className="bg-gradient-to-r from-emerald-900/30 to-slate-900/30 p-4 rounded-lg flex justify-between items-center border-t border-slate-600 mt-4 pt-4">
                  <span className="text-slate-100 font-bold text-lg">合計スコア</span>
                  <span className="text-3xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">{result.score}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset Button */}
      {imgUrl && (
        <div className="relative z-10 flex justify-center">
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
      )}
    </div>
  );
}
