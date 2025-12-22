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
 * スコア計算の重み
 */
const STAT_WEIGHTS: Record<string, number> = {
  'クリティカル': 2.0,
  'クリティカルダメージ': 2.0,
  '共鳴スキルダメージアップ': 1.5,
  '共鳴解放ダメージアップ': 1.5,
  '攻撃力': 1.5,
  // デフォルトの重み
  'default': 1.0,
};

/**
 * ステータス名から重みを取得
 */
function getStatWeight(statName: string): number {
  for (const [key, weight] of Object.entries(STAT_WEIGHTS)) {
    if (statName.includes(key)) {
      return weight;
    }
  }
  return STAT_WEIGHTS.default;
}

/**
 * スコア計算
 * @param main1 メインステータス1行目（ステータス名と%）
 * @param main2 メインステータス2行目（実数値 - 計算に含めない）
 * @param subs サブステータス配列
 */
export function calculateScore(main1: string, _main2: string, subs: string[]): number {
  let score = 0;
  
  // メインステータスのスコア（1行目のみ、%のみを使用）
  const main1Cleaned = cleanText(main1);
  const main1Percentage = extractPercentage(main1Cleaned);
  const main1StatName = normalizeStatName(main1Cleaned);
  const main1Weight = getStatWeight(main1StatName);
  
  score += main1Percentage * main1Weight;
  
  // サブステータスのスコア（%のみを使用）
  for (const sub of subs) {
    const subCleaned = cleanText(sub);
    const subPercentage = extractPercentage(subCleaned);
    const subStatName = normalizeStatName(subCleaned);
    const subWeight = getStatWeight(subStatName);
    
    score += subPercentage * subWeight;
  }
  
  return Math.round(score * 10) / 10; // 小数点1桁に丸める
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
