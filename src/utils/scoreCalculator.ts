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
 * %記号の有無に関わらず、最初の数値を抽出
 */
export function extractPercentage(text: string): number {
  // %記号がある場合はそれを使用
  const matchWithPercent = text.match(/([\d.]+)\s*%/);
  if (matchWithPercent) {
    return parseFloat(matchWithPercent[1]);
  }
  
  // %記号がない場合は最初の数値を使用
  const matchNumber = text.match(/([\d.]+)/);
  if (matchNumber) {
    return parseFloat(matchNumber[1]);
  }
  
  return 0;
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
 * ゲーム内の公式計算に基づいて逆算された倍率
 * 参考スクリーンショットで総合スコア≈69になるよう調整
 */
const CHARACTER_WEIGHTS: Record<string, Record<string, number>> = {
  // カルロッタ（凝縮ダメージ主体）
  // ゲーム内公式計算を基準
  'カルロッタ': {
    '凝縮ダメージアップ': 0.5,        // メイン ☆5
    'クリティカル': 2.0,              // サブ ☆5
    'クリティカルダメージ': 1.0,      // サブ ☆5
    '攻撃力': 1.25,                   // サブ ☆4（%のみ）
    '共鳴スキルダメージアップ': 1.0,  // サブ ☆3
    '共鳴解放ダメージアップ': 0.0,    // ☆1（無視）
    '共鳴効率': 0.4,                  // サブ ☆2
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
 * スコア計算（詳細情報付き、OCR認識結果の%値を直接使用）
 * @param statTexts ステータスの完全テキスト配列（ステータス名と%）
 * @param percentages OCRで認識した%値の配列（直接利用）
 * @param characterName キャラクター名
 */
export function calculateScoreWithBreakdown(
  statTexts: string[],
  percentages: number[],
  characterName?: string
): ScoreDetail {
  let score = 0;
  const breakdown: ScoreDetail['breakdown'] = [];

  if (statTexts.length === 0 || percentages.length === 0) {
    return { score: 0, breakdown: [] };
  }

  // メインステータス（インデックス0）
  const main1StatName = normalizeStatName(statTexts[0]);
  const main1Percentage = percentages[0];
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

  // サブステータス（インデックス1以降）
  for (let i = 1; i < statTexts.length; i++) {
    const subStatName = normalizeStatName(statTexts[i]);
    const subPercentage = percentages[i];
    const subWeight = getStatWeight(subStatName, characterName);
    const subContribution = subPercentage * subWeight;

    score += subContribution;
    breakdown.push({
      type: 'sub',
      index: i,
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
 * @param statTexts ステータスの完全テキスト配列
 * @param percentages %値の配列
 * @param characterName キャラクター名
 */
export function calculateScore(statTexts: string[], percentages: number[], characterName?: string): number {
  return calculateScoreWithBreakdown(statTexts, percentages, characterName).score;
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
