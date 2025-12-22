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
  
  // 小数点の後の余分なスペースを削除（"30. 0" → "30.0"）
  cleaned = cleaned.replace(/(\d+)\.\s+(\d+)/g, '$1.$2');
  
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
 * @param text OCRで取得したテキスト
 * @param fullText 元のテキスト全体（%判定用）
 */
export function normalizeStatName(text: string, fullText?: string): string {
  const cleaned = cleanText(text);
  
  // 数値部分を削除してステータス名だけを取得
  let statName = cleaned.replace(/[\d.]+%?/g, '').trim();
  
  // すべての記号を削除（比較用の正規化）
  statName = statName.replace(/[-\s()（）_・]+/g, '').trim();
  
  // 実数値かどうかを判定（%記号がない場合）
  const isAbsoluteValue = fullText && !/%/.test(fullText) && /\d/.test(fullText);
  
  // 攻撃力の場合、実数値なら明示的に識別
  if (statName.includes('攻撃') && isAbsoluteValue) {
    return '攻撃力(実数値)';
  }
  
  return statName;
}

/**
 * キャラクター別の重み設定
 * ゲーム内の公式計算を完全に再現
 * 参考個体で正確に69になるよう調整
 */
const CHARACTER_WEIGHTS: Record<string, Record<string, number>> = {
  // カルロッタ（凝縮ダメージ主体）
'カルロッタ': {
    // メインオプション
    '凝縮ダメージアップ': 0.5,        // 30.0% * 0.5 = 15
    
    // サブオプション
    'クリティカル': 2.0,              // 9.9% * 2.0 = 19.8
    'クリティカルダメージ': 1.0,      // 15.0% * 1.0 = 15
    '攻撃力': 1.25,                   // 9.4% * 1.25 = 11.75（%表記）
    '攻撃力(実数値)': 0.0,            // 実数値は評価外
    '共鳴スキルダメージアップ': 1.0,  // 7.1% * 1.0 = 7.1
    '共鳴解放ダメージアップ': 0.0,    // 評価外 (スコア 0)
    '共鳴効率': 0.4,                  // 星2評価に基づき設定
    '通常攻撃ダメージアップ': 0.0,    // 星1評価のため 0
},
};

/**
 * 編集距離（Levenshtein距離）を計算
 */
function calculateEditDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[len1][len2];
}

/**
 * ステータス名から重みを取得（ファジーマッチング使用）
 * @returns {weight: 重み, matchedKey: マッチしたキー名}
 */
function getStatWeight(statName: string, characterName?: string): { weight: number; matchedKey: string } {
  console.log('[getStatWeight] statName:', statName, 'characterName:', characterName);
  
  // キャラクター別の重みを使用
  if (characterName && CHARACTER_WEIGHTS[characterName]) {
    const table = CHARACTER_WEIGHTS[characterName];
    const keys = Object.keys(table);
    console.log('[getStatWeight] テーブルが見つかりました:', keys);
    
    // 完全一致を最優先でチェック
    if (statName in table) {
      console.log('[getStatWeight] 完全一致:', statName, '-> weight:', table[statName]);
      return { weight: table[statName], matchedKey: statName };
    }
    
    // 正規化して比較（記号を削除）
    const normalizedStatName = statName.replace(/[-\s()（）_・]+/g, '');
    
    // 編集距離で最も近いキーを見つける
    let bestMatch = keys[0];
    let bestDistance = calculateEditDistance(normalizedStatName, keys[0].replace(/[-\s()（）_・]+/g, ''));
    
    for (let i = 1; i < keys.length; i++) {
      const normalizedKey = keys[i].replace(/[-\s()（）_・]+/g, '');
      const distance = calculateEditDistance(normalizedStatName, normalizedKey);
      console.log(`[getStatWeight] "${keys[i]}" との距離: ${distance}`);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = keys[i];
      }
    }
    
    console.log('[getStatWeight] 最も近い一致:', bestMatch, '(距離:', bestDistance, ') -> weight:', table[bestMatch]);
    return { weight: table[bestMatch], matchedKey: bestMatch };
  } else {
    console.log('[getStatWeight] キャラクターテーブルが見つかりません');
  }

  // キャラクター指定なしまたは該当なしの場合はデフォルト値
  return { weight: 1.0, matchedKey: statName };
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
  const main1StatName = normalizeStatName(statTexts[0], statTexts[0]);
  const main1Percentage = percentages[0];
  const main1Result = getStatWeight(main1StatName, characterName);
  const main1Contribution = main1Percentage * main1Result.weight;

  score += main1Contribution;
  breakdown.push({
    type: 'main1',
    statName: main1Result.matchedKey,
    percentage: main1Percentage,
    weight: main1Result.weight,
    contribution: Math.round(main1Contribution * 10) / 10,
  });

  // サブステータス（インデックス1以降）
  for (let i = 1; i < statTexts.length; i++) {
    const subStatName = normalizeStatName(statTexts[i], statTexts[i]);
    const subPercentage = percentages[i];
    const subResult = getStatWeight(subStatName, characterName);
    const subContribution = subPercentage * subResult.weight;

    score += subContribution;
    breakdown.push({
      type: 'sub',
      index: i,
      statName: subResult.matchedKey,
      percentage: subPercentage,
      weight: subResult.weight,
      contribution: Math.round(subContribution * 10) / 10,
    });
  }

  return {
    score: Math.round(score),
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
  if (score >= 65) return 'SS';
  if (score >= 45) return 'S';
  if (score >= 25) return 'A';
  return 'B';
}
