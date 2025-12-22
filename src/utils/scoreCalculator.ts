/**
 * OCR結果のテキスト処理とスコア計算
 */

/**
 * 文字列間のスペースを削除（数字と%の前のスペースは保持）
 */
export function cleanText(text: string): string {
  // 改行やタブを削除
  let cleaned = text.replace(/[\r\n\t]/g, ' ');
  
  // 数字や%の前以外のスペースを削除
  // まず全てのスペースを削除してから、数字の前に1つスペースを追加
  cleaned = cleaned.replace(/\s+/g, '');
  
  // 数字の前にスペースを追加
  cleaned = cleaned.replace(/([^\d\s])(\d)/g, '$1 $2');
  
  return cleaned.trim();
}

/**
 * テキストから数値（%）を抽出
 */
export function extractPercentage(text: string): number {
  const match = text.match(/([\d.]+)%/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * ステータス名を正規化
 */
export function normalizeStatName(text: string): string {
  const cleaned = cleanText(text);
  
  // 数値部分を削除してステータス名だけを取得
  const statName = cleaned.replace(/[\d.]+%?/g, '').trim();
  
  return statName;
}

/**
 * ベースの重み（キャラクター指定がない場合の既定値）
 */
const BASE_WEIGHTS: Record<string, number> = {
  'クリティカル': 2.0,
  'クリティカルダメージ': 2.0,
  '共鳴スキルダメージアップ': 1.5,
  '共鳴解放ダメージアップ': 1.5,
  '攻撃力': 1.5,
  '凝縮ダメージアップ': 1.0,
  '通常攻撃ダメージアップ': 1.0,
  // デフォルトの重み
  'default': 1.0,
};

/**
 * キャラクター別の重み設定
 * 画像の星評価を数値化したもの。☆1=1.0倍、☆5=2.0倍の線形スケール。
 * 参考スクリーンショットの個体で総合スコア≈69になるよう調整。
 */
const CHARACTER_WEIGHTS: Record<string, Record<string, number>> = {
  // カルロッタ（凝縮ダメージ主体）
  // メイン: ☆5→2.0倍
  // サブ: ☆5→2.0倍
  'カルロッタ': {
    '凝縮ダメージアップ': 2.0,        // メイン ☆5
    'クリティカルダメージ': 2.0,      // メイン ☆5 / サブ ☆5
    'クリティカル': 2.0,              // メイン ☆5 / サブ ☆5
    '攻撃力': 2.0,                    // メイン ☆5 / サブ ☆4
    '共鳴スキルダメージアップ': 1.0,  // サブ ☆3
    '共鳴効率': 0.5,                  // サブ ☆2
    '通常攻撃ダメージアップ': 0.0,    // サブ ☆1（無視）
  },
};

/**
 * ステータス名から重みを取得
 */
function getStatWeight(statName: string, characterName?: string): number {
  // キャラクター別の重みがあれば優先
  if (characterName && CHARACTER_WEIGHTS[characterName]) {
    const table = CHARACTER_WEIGHTS[characterName];
    for (const [key, weight] of Object.entries(table)) {
      if (statName.includes(key)) {
        return weight;
      }
    }
  }

  // 既定の重みにフォールバック
  for (const [key, weight] of Object.entries(BASE_WEIGHTS)) {
    if (statName.includes(key)) {
      return weight;
    }
  }
  return BASE_WEIGHTS.default;
}

/**
 * スコア計算の詳細情報
 */
export type ScoreDetail = {
  score: number;
  breakdown: Array<{
    type: 'main1' | 'sub';
    index?: number;
    statName: string;
    percentage: number;
    weight: number;
    contribution: number;
  }>;
};

/**
 * スコア計算（詳細情報付き）
 * @param main1 メインステータス1行目（ステータス名と%）
 * @param main2 メインステータス2行目（実数値 - 計算に含めない）
 * @param subs サブステータス配列
 */
export function calculateScoreWithBreakdown(main1: string, _main2: string, subs: string[], characterName?: string): ScoreDetail {
  let score = 0;
  const breakdown: ScoreDetail['breakdown'] = [];
  
  // メインステータスのスコア（1行目のみ、%のみを使用）
  const main1Cleaned = cleanText(main1);
  const main1Percentage = extractPercentage(main1Cleaned);
  const main1StatName = normalizeStatName(main1Cleaned);
  const main1Weight = getStatWeight(main1StatName, characterName);
  const main1Contribution = main1Percentage * main1Weight;
  
  score += main1Contribution;
  breakdown.push({
    type: 'main1',
    statName: main1StatName,
    percentage: main1Percentage,
    weight: main1Weight,
    contribution: Math.round(main1Contribution * 10) / 10,
  });
  
  // サブステータスのスコア（%のみを使用）
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const subCleaned = cleanText(sub);
    const subPercentage = extractPercentage(subCleaned);
    const subStatName = normalizeStatName(subCleaned);
    const subWeight = getStatWeight(subStatName, characterName);
    const subContribution = subPercentage * subWeight;
    
    score += subContribution;
    breakdown.push({
      type: 'sub',
      index: i + 1,
      statName: subStatName,
      percentage: subPercentage,
      weight: subWeight,
      contribution: Math.round(subContribution * 10) / 10,
    });
  }
  
  return {
    score: Math.round(score * 10) / 10,
    breakdown,
  };
}

/**
 * スコア計算（従来の戻り値）
 * @param main1 メインステータス1行目（ステータス名と%）
 * @param main2 メインステータス2行目（実数値 - 計算に含めない）
 * @param subs サブステータス配列
 */
export function calculateScore(main1: string, main2: string, subs: string[], characterName?: string): number {
  return calculateScoreWithBreakdown(main1, main2, subs, characterName).score;
}

/**
 * スコアの評価ランク
 */
export function getScoreRank(score: number): string {
  if (score >= 100) return 'SSS';
  if (score >= 90) return 'SS';
  if (score >= 80) return 'S';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}
