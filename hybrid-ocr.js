// ===================================================================
// 軽量ハイブリッドOCRシステム
// OpenCV.js + 特定領域OCR + テンプレートマッチング
// ===================================================================

export class LightweightHybridOCR {
    constructor() {
        this.templateCache = new Map();
        this.statTemplates = new Map();
        this.isOpenCVReady = false;
        this.gameConfigs = null;
        this.initializeSystem();
    }

    async initializeSystem() {
        // OpenCV.jsの初期化
        await this.loadOpenCV();
        
        // ゲーム別のステータステンプレートを準備
        this.loadStatTemplates();
        
        // ゲーム設定の読み込み
        this.loadGameConfigs();
        
        console.log('Lightweight Hybrid OCR System initialized');
    }

    loadGameConfigs() {
        // ゲーム設定をローカルで保持
        this.gameConfigs = {
            '鳴潮': {
                three_area_recognition: {
                    item_name_area: [720, 70, 190, 20],
                    excluded_stats_area: [720, 140, 205, 20],
                    included_stats_area: [720, 120, 205, 123]
                },
                ocr_settings: {
                    threshold: 160,
                    tesseract_config: {
                        psm: 6,
                        tessedit_char_whitelist:
                            "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー・攻撃力防御力HP会心率会心ダメージ効率"
                    }
                },
                stat_map: {
                    "攻撃力": "攻撃力",
                    "ATK": "攻撃力",
                    "防御力": "防御力",
                    "DEF": "防御力",
                    "HP": "HP",
                    "ライフ": "HP",
                    "会心率": "会心率",
                    "クリ率": "会心率",
                    "会心ダメージ": "会心ダメージ",
                    "クリダメ": "会心ダメージ",
                    "効率": "効率"
                }
            }
        };
    }

    /**
     * OpenCVベースの前処理: グレースケール → CLAHE → ノイズ除去 → 適応的2値化 → モルフォロジー
     * type: 'name' | 'main' | 'sub' でパラメータを最適化
     */
    cvPreprocess(canvas, type = 'sub') {
        if (!this.isOpenCVReady || !canvas) return canvas;

        try {
            const src = cv.imread(canvas);
            
            // グレースケール化
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // CLAHE（コントラスト限定適応的ヒストグラム平坦化）
            const claheIntensity = type === 'name' ? 3.0 : type === 'main' ? 2.5 : 2.0;
            const clahe = new cv.CLAHE(claheIntensity, new cv.Size(8, 8));
            const claheOut = new cv.Mat();
            clahe.apply(gray, claheOut);
            clahe.delete();

            // ノイズ除去（バイラテラルフィルタまたはモルフォロジー）
            const denoised = new cv.Mat();
            const kernelSize = type === 'name' ? 3 : 5;
            cv.morphologyEx(
                claheOut, 
                denoised, 
                cv.MORPH_OPEN, 
                cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize))
            );

            // ガウシアンブラー
            const blurred = new cv.Mat();
            const blurSize = type === 'name' ? 3 : type === 'main' ? 3 : 5;
            cv.GaussianBlur(denoised, blurred, new cv.Size(blurSize, blurSize), 0, 0, cv.BORDER_DEFAULT);

            // 適応的2値化（ゲーム独特の金色テキスト対応）
            const binary = new cv.Mat();
            const blockSize = type === 'name' ? 15 : type === 'main' ? 19 : 25;
            const C = type === 'name' ? 5 : type === 'main' ? 8 : 10;
            cv.adaptiveThreshold(
                blurred,
                binary,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY_INV,
                blockSize,
                C
            );

            // モルフォロジー処理：クロージング（小さな穴を埋める）
            const morphKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
            const morphed = new cv.Mat();
            cv.morphologyEx(binary, morphed, cv.MORPH_CLOSE, morphKernel);
            morphKernel.delete();

            // 文字を黒、背景を白に正規化
            const inverted = new cv.Mat();
            cv.bitwise_not(morphed, inverted);

            // Canvas への出力
            const dstCanvas = document.createElement('canvas');
            cv.imshow(dstCanvas, inverted);

            // メモリ解放
            src.delete();
            gray.delete();
            claheOut.delete();
            denoised.delete();
            blurred.delete();
            binary.delete();
            morphed.delete();
            inverted.delete();

            return dstCanvas;
        } catch (error) {
            console.error('cvPreprocess エラー:', error);
            return canvas;
        }
    }

    async loadOpenCV() {
        return new Promise((resolve) => {
            if (typeof cv !== 'undefined') {
                this.isOpenCVReady = true;
                resolve();
                return;
            }

            // OpenCV.jsの動的ロード
            const script = document.createElement('script');
            script.src = 'https://docs.opencv.org/4.5.0/opencv.js';
            script.onload = () => {
                cv['onRuntimeInitialized'] = () => {
                    this.isOpenCVReady = true;
                    console.log('OpenCV.js loaded');
                    resolve();
                };
            };
            document.head.appendChild(script);
        });
    }

    loadStatTemplates() {
        // 各ゲームのステータスアイコン/文字のテンプレートを定義
        const gameTemplates = {
            '鳴潮': {
                'attack': { 
                    keywords: ['攻撃力', 'ATK'], 
                    color: [255, 215, 0], // 金色
                    position: 'left'
                },
                'hp': { 
                    keywords: ['HP', 'ライフ'], 
                    color: [255, 255, 255], // 白
                    position: 'left'
                },
                'defense': { 
                    keywords: ['防御力', 'DEF'], 
                    color: [255, 255, 255], 
                    position: 'left'
                },
                'critical': { 
                    keywords: ['クリティカル', 'クリ'], 
                    color: [255, 215, 0], 
                    position: 'left'
                }
            },
            '原神': {
                'attack': { keywords: ['攻撃力'], color: [255, 255, 255] },
                'hp': { keywords: ['HP'], color: [255, 255, 255] },
                'defense': { keywords: ['防御力'], color: [255, 255, 255] },
                'critical_rate': { keywords: ['会心率'], color: [255, 255, 255] },
                'critical_damage': { keywords: ['会心ダメージ'], color: [255, 255, 255] }
            }
        };

        for (const [game, templates] of Object.entries(gameTemplates)) {
            this.statTemplates.set(game, templates);
        }

        // フィルター関数マップの初期化
        this.filters = new Map([
            ['denoise', (canvas) => this.denoiseFilter(canvas)],
            ['adaptiveBinary', (canvas) => this.adaptiveBinaryFilter(canvas)],
            ['backgroundRemoval', (canvas) => this.backgroundRemovalFilter(canvas)],
            ['sharpen', (canvas) => this.sharpenFilter(canvas)],
            ['edgeEnhance', (canvas) => this.edgeEnhanceFilter(canvas)]
        ]);
    }

    // ===================================================================
    // フィルター実装
    // ===================================================================

    denoiseFilter(canvas) {
        if (!this.isOpenCVReady) return canvas;
        
        try {
            const src = cv.imread(canvas);
            const dst = new cv.Mat();
            cv.fastNlMeansDenoising(src, dst);
            
            const resultCanvas = document.createElement('canvas');
            cv.imshow(resultCanvas, dst);
            
            src.delete();
            dst.delete();
            
            return resultCanvas;
        } catch (error) {
            console.warn('denoiseFilter エラー:', error);
            return canvas;
        }
    }

    sharpenFilter(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // シャープニングカーネル
        const kernel = [
            0, -1,  0,
            -1,  5, -1,
            0, -1,  0
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    let idx = 0;
                    
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const pixelIdx = ((y + dy) * width + (x + dx)) * 4 + c;
                            sum += data[pixelIdx] * kernel[idx++];
                        }
                    }
                    
                    const pixelIdx = (y * width + x) * 4 + c;
                    data[pixelIdx] = Math.max(0, Math.min(255, sum));
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    backgroundRemovalFilter(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 明度に基づいて背景を除去
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r + g + b) / 3;

            if (brightness > 100 && brightness < 200) {
                // グレーゾーン（背景）を黒に
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * メイン処理：ハイブリッド認識システム
     */
    async recognizeGameStats(imageCanvas, gameType) {
        if (!this.isOpenCVReady) {
            throw new Error('OpenCV.js not ready');
        }

        const results = [];
        
        // Step 1: テンプレートマッチングでステータス領域を特定
        const statRegions = await this.detectStatRegions(imageCanvas, gameType);
        
        // Step 2: 各領域で数値特化OCRを実行
        for (const region of statRegions) {
            const numericResult = await this.recognizeNumericValue(
                imageCanvas, 
                region, 
                gameType
            );
            
            if (numericResult.confidence > 0.7) {
                results.push({
                    statName: region.statName,
                    value: numericResult.value,
                    confidence: numericResult.confidence,
                    method: 'hybrid'
                });
            }
        }
        
        return results;
    }

    async detectStatRegions(imageCanvas, gameType) {
        const templates = this.statTemplates.get(gameType);
        if (!templates) {
            console.warn(`No templates found for game: ${gameType}`);
            return [];
        }

        const src = cv.imread(imageCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        const regions = [];
        
        // 各ステータス種類に対してテンプレートマッチング
        for (const [statKey, template] of Object.entries(templates)) {
            const matchedRegions = await this.findTextRegions(
                gray, 
                template.keywords, 
                template.color
            );
            
            for (const region of matchedRegions) {
                regions.push({
                    statName: statKey,
                    textRect: region.textRect,
                    valueRect: this.calculateValueRect(region.textRect, template.position),
                    confidence: region.confidence
                });
            }
        }
        
        src.delete();
        gray.delete();
        
        return regions;
    }

    async findTextRegions(grayMat, keywords, targetColor) {
        const regions = [];
        
        // 色範囲でフィルタリング（ターゲット色に近い領域を抽出）
        const colorFiltered = this.filterByColorRange(grayMat, targetColor);
        
        // 輪郭検出でテキスト領域候補を抽出
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(
            colorFiltered, 
            contours, 
            hierarchy, 
            cv.RETR_EXTERNAL, 
            cv.CHAIN_APPROX_SIMPLE
        );
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const rect = cv.boundingRect(contour);
            
            // サイズによる絞り込み（テキストらしいサイズ）
            if (this.isValidTextRegion(rect)) {
                // この領域でOCRを実行してキーワードマッチング
                const ocrText = await this.quickOCR(grayMat, rect);
                const matchScore = this.calculateKeywordMatch(ocrText, keywords);
                
                if (matchScore > 0.6) {
                    regions.push({
                        textRect: rect,
                        confidence: matchScore,
                        recognizedText: ocrText
                    });
                }
            }
            
            contour.delete();
        }
        
        contours.delete();
        hierarchy.delete();
        colorFiltered.delete();
        
        return regions;
    }

    /**
     * 3エリア認識システム - 計算式の改善
     * エリア1: 音骸名前 / エリア2: 含めないステータス / エリア3: 含めるステータス
     */
    async recognizeThreeAreas(imageCanvas, gameType, areaOverride = null, options = {}) {
        const gameConfig = this.gameConfigs?.[gameType];
        
        if (!gameConfig?.three_area_recognition && !areaOverride) {
            throw new Error(`3エリア認識設定が見つかりません: ${gameType}`);
        }

        const baseAreas = areaOverride || gameConfig.three_area_recognition;
        const shouldScale = options.alreadyScaled ? false : options.autoScale !== false;
        const areas = this.scaleAreasForImage(baseAreas, gameConfig, imageCanvas, shouldScale);
        
        const results = {
            itemName: { text: '', confidence: 0, area: 'item_name' },
            excludedStats: [], // 計算から除外するステータス
            includedStats: [],  // 計算に含めるステータス
            debug: {
                areasUsed: areas,
                imageSize: { width: imageCanvas?.width, height: imageCanvas?.height },
                excluded: {},
                included: {}
            }
        };

        console.log('🎯 3エリア認識を開始:', gameType);
        console.log('  画像サイズ:', results.debug.imageSize);
        console.log('  認識エリア:', areas);

        // エリア1: 音骸名前の認識
        try {
            const itemNameCanvas = this.extractRegion(imageCanvas, {
                x: areas.item_name_area[0],
                y: areas.item_name_area[1], 
                width: areas.item_name_area[2],
                height: areas.item_name_area[3]
            });

            const preprocessedName = this.cvPreprocess(itemNameCanvas, 'name');
            const itemNameResult = await this.recognizeItemName(preprocessedName, gameType);
            results.itemName = {
                text: itemNameResult.text || '',
                confidence: itemNameResult.confidence || 0,
                area: 'item_name'
            };
            
            console.log('📝 音骸名前認識:', results.itemName);
        } catch (error) {
            console.warn('⚠️  音骸名前認識エラー:', error.message);
        }

        // エリア2: 含めないステータス（除外エリア）
        try {
            let excludedCanvas = this.extractRegion(imageCanvas, {
                x: areas.excluded_stats_area[0],
                y: areas.excluded_stats_area[1],
                width: areas.excluded_stats_area[2], 
                height: areas.excluded_stats_area[3]
            });

            excludedCanvas = this.cvPreprocess(excludedCanvas, 'main');

            const excludedResults = await this.recognizeStatArea(excludedCanvas, gameType, 'excluded', results.debug.excluded);
            results.excludedStats = excludedResults.map(stat => ({
                ...stat,
                area: 'excluded',
                includeInCalculation: false  // 計算から除外
            }));
            
            console.log(`🚫 除外ステータス: ${results.excludedStats.length}個 -`, results.excludedStats.map(s => s.name));
        } catch (error) {
            console.warn('⚠️  除外ステータス認識エラー:', error.message);
        }

        // エリア3: 含めるステータス（計算対象エリア）
        try {
            let includedCanvas = this.extractRegion(imageCanvas, {
                x: areas.included_stats_area[0],
                y: areas.included_stats_area[1],
                width: areas.included_stats_area[2],
                height: areas.included_stats_area[3]
            });

            includedCanvas = this.cvPreprocess(includedCanvas, 'sub');

            const includedResults = await this.recognizeStatArea(includedCanvas, gameType, 'included', results.debug.included);
            results.includedStats = includedResults.map(stat => ({
                ...stat,
                area: 'included',
                includeInCalculation: true  // 計算に含める
            }));
            
            console.log(`✅ 含めるステータス: ${results.includedStats.length}個 -`, results.includedStats.map(s => s.name));
        } catch (error) {
            console.warn('⚠️  含めるステータス認識エラー:', error.message);
        }

        console.log('✨ 3エリア認識完了 -', {
            itemName: results.itemName.text,
            excluded: results.excludedStats.length,
            included: results.includedStats.length
        });

        return results;
    }

    /**
     * 音骸名前の認識（エリア1専用）
     */
    async recognizeItemName(canvas, gameType) {
        if (!canvas) return { text: '', confidence: 0 };

        try {
            // 音骸名前に特化した前処理
            let processedCanvas = this.cloneCanvas(canvas);
            
            // 1. 3倍スケールアップ（テキストサイズ向上）
            processedCanvas = this.scaleCanvas(processedCanvas, 3.0);
            
            // 2. ゲーム固有の名前色抽出（金色テキスト対応）
            if (this.isOpenCVReady) {
                processedCanvas = await this.extractItemNameColor(processedCanvas, gameType);
            }
            
            // 3. 文字強調処理
            processedCanvas = this.enhanceTextForName(processedCanvas);

            // 音骸名前用のOCR設定（高精度）
            const ocrConfig = {
                psm: 8, // 単語レベル
                tessedit_char_whitelist: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー・'
            };

            const { data: { text, confidence } } = await Tesseract.recognize(
                processedCanvas,
                'jpn',
                { 
                    logger: m => {
                        if (m.status === 'recognizing') {
                            console.log('🔤 音骸名前認識中:', (m.progress * 100).toFixed(0) + '%');
                        }
                    },
                    ...ocrConfig 
                }
            );

            const cleanedText = text.trim().split('\n')[0]; // 複数行の場合は最初の行のみ
            console.log(`✓ 音骸名前認識: "${cleanedText}" (信頼度: ${Math.round(confidence)}%)`);

            return {
                text: cleanedText,
                confidence: confidence / 100
            };
        } catch (error) {
            console.error('音骸名前OCRエラー:', error);
            return { text: '', confidence: 0 };
        }
    }

    /**
     * ステータスエリアの認識（エリア2・3専用）
     */
    async recognizeStatArea(canvas, gameType, areaType, debugInfo = null) {
        const stats = [];
        
        if (!canvas) return stats;

        try {
            // ステータス行を検出（OpenCV + 行検出）
            const statLines = await this.detectStatLines(canvas);
            console.log(`📊 ${areaType}エリアで${statLines.length}行のステータスを検出`);

            if (debugInfo) {
                debugInfo.lines = statLines.map(l => ({ ...l }));
                debugInfo.canvas = { width: canvas.width, height: canvas.height };
                debugInfo.recognized = [];
            }

            // 各行からステータスを抽出
            for (let i = 0; i < statLines.length; i++) {
                const line = statLines[i];
                
                try {
                    const statResult = await this.recognizeStatLine(canvas, line, gameType);
                    
                    if (statResult && statResult.name && statResult.value) {
                        const statObj = {
                            name: statResult.name,
                            value: statResult.value,
                            confidence: statResult.confidence,
                            lineIndex: i,
                            area: areaType,
                            rawText: statResult.rawText || ''
                        };
                        stats.push(statObj);
                        
                        if (debugInfo) {
                            debugInfo.recognized.push({ ...statObj });
                        }
                        
                        console.log(`📈 ${areaType}[${i}]: ${statResult.name} = ${statResult.value} (信頼度: ${Math.round(statResult.confidence * 100)}%)`);
                    }
                } catch (error) {
                    console.warn(`ステータス行${i}の認識エラー:`, error.message);
                }
            }
        } catch (error) {
            console.error(`${areaType}エリア認識エラー:`, error);
        }

        return stats;
    }
    async recognizeNumericValue(imageCanvas, region, gameType) {
        // 数値領域を抽出
        const valueCanvas = this.extractRegion(imageCanvas, region.valueRect);
        
        // 数値に特化した前処理
        const processedCanvas = await this.numericPreprocessing(valueCanvas, gameType);
        
        // TesseractのPSM 7 (単一テキスト行) + 数値限定
        const ocrConfig = {
            psm: 7,
            tessedit_char_whitelist: '0123456789.,%+'
        };
        
        try {
            const { data: { text, confidence } } = await Tesseract.recognize(
                processedCanvas, 
                'eng', 
                { 
                    logger: m => console.log(m),
                    ...ocrConfig 
                }
            );
            
            // 数値パターンの正規化
            const normalizedValue = this.normalizeNumericText(text.trim());
            
            return {
                value: normalizedValue,
                confidence: confidence / 100,
                method: 'numeric_ocr'
            };
            
        } catch (error) {
            console.warn('Numeric OCR failed:', error);
            return { value: '', confidence: 0 };
        }
    }

    async numericPreprocessing(canvas, gameType) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 1. 3倍スケールアップ（OCR精度向上）
        const scaledCanvas = this.scaleCanvas(canvas, 3.0);
        const scaledCtx = scaledCanvas.getContext('2d');
        const scaledImageData = scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
        const scaledData = scaledImageData.data;
        
        // 2. 色範囲による数値抽出（ゲーム固有）
        const colorThreshold = this.getGameColorThreshold(gameType);
        
        for (let i = 0; i < scaledData.length; i += 4) {
            const r = scaledData[i];
            const g = scaledData[i + 1];
            const b = scaledData[i + 2];
            
            // HSV変換して数値色を判定
            const [h, s, v] = this.rgbToHsv(r, g, b);
            
            let isNumericText = false;
            
            // ゲーム固有の数値色判定
            if (gameType === '鳴潮') {
                // 金色の数値: H=45-55, S>60, V>60
                // 白色の数値: S<30, V>200
                isNumericText = (
                    (h >= 45 && h <= 55 && s > 60 && v > 60) ||
                    (s < 30 && v > 200)
                );
            } else if (gameType === '原神') {
                // 主に白色: S<40, V>180
                isNumericText = (s < 40 && v > 180);
            }
            
            if (isNumericText) {
                // 文字を強調（白に）
                scaledData[i] = 255;
                scaledData[i + 1] = 255;
                scaledData[i + 2] = 255;
            } else {
                // 背景を除去（黒に）
                scaledData[i] = 0;
                scaledData[i + 1] = 0;
                scaledData[i + 2] = 0;
            }
        }
        
        scaledCtx.putImageData(scaledImageData, 0, 0);
        
        // 3. モルフォロジー処理（文字の補強）
        const morphed = this.morphologyClose(scaledCanvas, 2);
        
        return morphed;
    }

    async standardPipeline(imageData, gameType) {
        let canvas = this.cloneCanvas(imageData);
        
        // ノイズ除去
        canvas = this.filters.get('denoise')(canvas);
        
        // コントラスト強化
        canvas = this.enhanceContrast(canvas, 1.5);
        
        // 適応的2値化
        canvas = this.filters.get('adaptiveBinary')(canvas);
        
        return canvas;
    }

    async backgroundRemovalPipeline(imageData, gameType) {
        let canvas = this.cloneCanvas(imageData);
        
        // 色空間変換によるテキスト領域抽出
        canvas = this.extractTextRegions(canvas, gameType);
        
        // 背景除去
        canvas = this.filters.get('backgroundRemoval')(canvas);
        
        // シャープネス強化
        canvas = this.filters.get('sharpen')(canvas);
        
        // 適応的2値化
        canvas = this.filters.get('adaptiveBinary')(canvas);
        
        return canvas;
    }

    async edgeEnhancementPipeline(imageData, gameType) {
        let canvas = this.cloneCanvas(imageData);
        
        // エッジ検出・強調
        canvas = this.filters.get('edgeEnhance')(canvas);
        
        // モルフォロジー処理
        canvas = this.morphologyClose(canvas);
        
        // ガウシアンフィルター
        canvas = this.gaussianBlur(canvas, 0.5);
        
        // 2値化
        canvas = this.adaptiveThreshold(canvas);
        
        return canvas;
    }

    async gameSpecificPipeline(imageData, gameType) {
        const gameProfiles = {
            '鳴潮': {
                colorRange: { h: [35, 50], s: [70, 100], v: [70, 100] }, // 金色テキスト
                fontSize: 'medium',
                backgroundPattern: 'dark_gradient'
            },
            '原神': {
                colorRange: { h: [0, 360], s: [0, 30], v: [80, 100] }, // 白テキスト
                fontSize: 'small',
                backgroundPattern: 'dark_solid'
            },
            '崩壊：スターレイル': {
                colorRange: { h: [180, 220], s: [60, 100], v: [70, 100] }, // 青テキスト
                fontSize: 'medium',
                backgroundPattern: 'gradient_complex'
            }
        };

        const profile = gameProfiles[gameType];
        if (!profile) return this.standardPipeline(imageData, gameType);

        let canvas = this.cloneCanvas(imageData);
        
        // ゲーム固有の色範囲でマスク作成
        canvas = this.createColorMask(canvas, profile.colorRange);
        
        // フォントサイズに応じた最適化
        canvas = this.optimizeForFontSize(canvas, profile.fontSize);
        
        // 背景パターンに応じた処理
        canvas = this.processBackgroundPattern(canvas, profile.backgroundPattern);
        
        return canvas;
    }

    // ===================================================================
    // ゲーム固有前処理ユーティリティ
    // ===================================================================

    createColorMask(canvas, colorRange) {
        // 色範囲でマスク作成（未実装 - フォールバック）
        return canvas;
    }

    optimizeForFontSize(canvas, fontSize) {
        // フォントサイズに応じた最適化（未実装 - フォールバック）
        return canvas;
    }

    processBackgroundPattern(canvas, pattern) {
        // 背景パターン処理（未実装 - フォールバック）
        return canvas;
    }

    extractRegion(canvas, rect) {
        const regionCanvas = document.createElement('canvas');
        regionCanvas.width = rect.width;
        regionCanvas.height = rect.height;
        const ctx = regionCanvas.getContext('2d');
        
        ctx.drawImage(
            canvas, 
            rect.x, rect.y, rect.width, rect.height,
            0, 0, rect.width, rect.height
        );
        
        return regionCanvas;
    }

    calculateValueRect(textRect, position) {
        // テキスト位置から数値位置を推定
        const valueRect = { ...textRect };
        
        if (position === 'right') {
            // 数値がテキストの右側にある場合
            valueRect.x = textRect.x + textRect.width + 10;
            valueRect.width = textRect.width * 0.8;
        } else {
            // デフォルト: テキストの下または右
            valueRect.x = textRect.x + textRect.width * 0.6;
            valueRect.width = textRect.width * 0.4;
        }
        
        return valueRect;
    }

    normalizeNumericText(text) {
        // OCR結果の数値を正規化
        return text
            .replace(/[Oo]/g, '0')  // O -> 0
            .replace(/[Il\|]/g, '1') // I,l,| -> 1
            .replace(/[Ss]/g, '5')   // S -> 5
            .replace(/[^0-9.,%+]/g, '') // 数値関連文字以外を除去
            .replace(/([0-9])([0-9])\.([0-9])/, '$1.$2$3') // 小数点位置修正
            .trim();
    }

    scaleAreasForImage(baseAreas, gameConfig, imageCanvas, shouldScale = true) {
        if (!baseAreas) return null;
        if (!shouldScale) return JSON.parse(JSON.stringify(baseAreas));

        const baseRes = gameConfig?.base_resolution || {
            width: imageCanvas?.width || 1,
            height: imageCanvas?.height || 1
        };
        const imgW = imageCanvas?.width || baseRes.width;
        const imgH = imageCanvas?.height || baseRes.height;
        const scaleX = imgW / baseRes.width;
        const scaleY = imgH / baseRes.height;
        const scaleRect = (rect) => [
            Math.round(rect[0] * scaleX),
            Math.round(rect[1] * scaleY),
            Math.round(rect[2] * scaleX),
            Math.round(rect[3] * scaleY)
        ];

        return {
            item_name_area: scaleRect(baseAreas.item_name_area),
            excluded_stats_area: scaleRect(baseAreas.excluded_stats_area),
            included_stats_area: scaleRect(baseAreas.included_stats_area)
        };
    }

    scaleCanvas(canvas, scale) {
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = canvas.width * scale;
        scaledCanvas.height = canvas.height * scale;
        const ctx = scaledCanvas.getContext('2d');
        
        ctx.imageSmoothingEnabled = false; // ピクセル補間を無効化
        ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        
        return scaledCanvas;
    }

    rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, v = max;
        
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return [h * 360, s * 100, v * 255];
    }

    getGameColorThreshold(gameType) {
        const thresholds = {
            '鳴潮': {
                gold: { h: [45, 55], s: [60, 100], v: [60, 100] },
                white: { h: [0, 360], s: [0, 30], v: [200, 255] }
            },
            '原神': {
                white: { h: [0, 360], s: [0, 40], v: [180, 255] }
            },
            '崩壊：スターレイル': {
                blue: { h: [180, 220], s: [60, 100], v: [70, 100] },
                white: { h: [0, 360], s: [0, 40], v: [180, 255] }
            }
        };
        
        return thresholds[gameType] || thresholds['原神'];
    }

    morphologyClose(canvas, kernelSize = 3) {
        if (!this.isOpenCVReady) return canvas;
        
        const src = cv.imread(canvas);
        const dst = new cv.Mat();
        const kernel = cv.getStructuringElement(
            cv.MORPH_RECT, 
            new cv.Size(kernelSize, kernelSize)
        );
        
        cv.morphologyEx(src, dst, cv.MORPH_CLOSE, kernel);
        
        const resultCanvas = document.createElement('canvas');
        cv.imshow(resultCanvas, dst);
        
        src.delete();
        dst.delete();
        kernel.delete();
        
        return resultCanvas;
    }

    isValidTextRegion(rect) {
        // テキスト領域として妥当なサイズかチェック
        return (
            rect.width > 20 && rect.width < 200 &&
            rect.height > 10 && rect.height < 50 &&
            rect.width / rect.height > 1.5 && rect.width / rect.height < 10
        );
    }

    calculateKeywordMatch(text, keywords) {
        if (!text || text.length === 0) return 0;
        
        const normalizedText = text.toLowerCase().replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\w]/g, '');
        
        let bestMatch = 0;
        for (const keyword of keywords) {
            const normalizedKeyword = keyword.toLowerCase();
            
            // 完全一致
            if (normalizedText.includes(normalizedKeyword)) {
                return 1.0;
            }
            
            // 部分一致スコア
            const partialScore = this.calculatePartialMatch(normalizedText, normalizedKeyword);
            bestMatch = Math.max(bestMatch, partialScore);
        }
        
        return bestMatch;
    }

    calculatePartialMatch(text, keyword) {
        let matchCount = 0;
        let i = 0, j = 0;
        
        while (i < text.length && j < keyword.length) {
            if (text[i] === keyword[j]) {
                matchCount++;
                j++;
            }
            i++;
        }
        
        return matchCount / keyword.length;
    }

    filterByColorRange(grayMat, targetColor) {
        // 色範囲によるフィルタリング（簡易版）
        const binary = new cv.Mat();
        cv.threshold(grayMat, binary, 127, 255, cv.THRESH_BINARY);
        return binary;
    }

    async quickOCR(grayMat, rect) {
        // 軽量なOCR（テンプレートマッチング用）
        const regionCanvas = document.createElement('canvas');
        regionCanvas.width = rect.width;
        regionCanvas.height = rect.height;
        
        const region = grayMat.roi(rect);
        cv.imshow(regionCanvas, region);
        region.delete();
        
        try {
            const { data: { text } } = await Tesseract.recognize(
                regionCanvas, 
                'jpn', 
                { 
                    psm: 8, // 単語レベル
                    tessedit_char_whitelist: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン攻撃力防御HPクリティカルダメージ効率'
                }
            );
            return text.trim();
        } catch (error) {
            return '';
        }
    }

    // ===================================================================
    // 個別フィルター実装
    // ===================================================================

    denoiseFilter(canvas) {
        // メディアンフィルターによるノイズ除去
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        const result = new Uint8ClampedArray(data.length);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // 3x3近傍の値を収集
                const neighbors = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                        neighbors.push(data[nIdx]);
                    }
                }
                
                // メディアン値を計算
                neighbors.sort((a, b) => a - b);
                const median = neighbors[4]; // 9要素の中央値
                
                result[idx] = median;
                result[idx + 1] = median;
                result[idx + 2] = median;
                result[idx + 3] = data[idx + 3];
            }
        }
        
        ctx.putImageData(new ImageData(result, width, height), 0, 0);
        return canvas;
    }

    edgeEnhanceFilter(canvas) {
        // Sobelフィルターによるエッジ検出・強調
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        
        const result = new Uint8ClampedArray(data.length);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                let gx = 0, gy = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const nIdx = ((y + ky) * width + (x + kx)) * 4;
                        const gray = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
                        const kIdx = (ky + 1) * 3 + (kx + 1);
                        
                        gx += gray * sobelX[kIdx];
                        gy += gray * sobelY[kIdx];
                    }
                }
                
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                const enhanced = Math.min(255, magnitude * 2);
                
                result[idx] = enhanced;
                result[idx + 1] = enhanced;
                result[idx + 2] = enhanced;
                result[idx + 3] = data[idx + 3];
            }
        }
        
        ctx.putImageData(new ImageData(result, width, height), 0, 0);
        return canvas;
    }

    adaptiveBinaryFilter(canvas) {
        // 適応的2値化（Otsu's method + local threshold）
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // グレースケール変換
        const gray = new Array(width * height);
        for (let i = 0; i < width * height; i++) {
            gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
        }
        
        // Otsu's methodで全体の閾値を計算
        const globalThreshold = this.otsuThreshold(gray);
        
        // 局所的な適応的2値化
        const result = new Uint8ClampedArray(data.length);
        const windowSize = Math.max(5, Math.min(width, height) / 50);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                // 局所領域の平均を計算
                let sum = 0, count = 0;
                for (let dy = -windowSize; dy <= windowSize; dy++) {
                    for (let dx = -windowSize; dx <= windowSize; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            sum += gray[ny * width + nx];
                            count++;
                        }
                    }
                }
                const localMean = sum / count;
                
                // 適応的閾値（全体閾値と局所平均の重み付け平均）
                const adaptiveThreshold = globalThreshold * 0.7 + localMean * 0.3;
                
                const value = gray[y * width + x] > adaptiveThreshold ? 255 : 0;
                result[idx] = value;
                result[idx + 1] = value;
                result[idx + 2] = value;
                result[idx + 3] = data[idx + 3];
            }
        }
        
        ctx.putImageData(new ImageData(result, width, height), 0, 0);
        return canvas;
    }

    // ===================================================================
    // ユーティリティ関数
    // ===================================================================

    cloneCanvas(originalCanvas) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = originalCanvas.width;
        newCanvas.height = originalCanvas.height;
        const ctx = newCanvas.getContext('2d');
        ctx.drawImage(originalCanvas, 0, 0);
        return newCanvas;
    }

    otsuThreshold(gray) {
        // Otsu's method implementation
        const histogram = new Array(256).fill(0);
        gray.forEach(pixel => histogram[Math.floor(pixel)]++);
        
        const total = gray.length;
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += i * histogram[i];
        }
        
        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let maximum = 0.0;
        let threshold = 0;
        
        for (let i = 0; i < 256; i++) {
            wB += histogram[i];
            if (wB === 0) continue;
            
            wF = total - wB;
            if (wF === 0) break;
            
            sumB += i * histogram[i];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            
            const between = wB * wF * Math.pow(mB - mF, 2);
            
            if (between > maximum) {
                maximum = between;
                threshold = i;
            }
        }
        
        return threshold;
    }

    enhanceContrast(canvas, factor) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
            data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
            data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    // その他のフィルター実装は省略（sharpen, backgroundRemoval, morphology等）

    // ===================================================================
    // 3エリア認識システム用の補助メソッド 
    // ===================================================================

    /**
     * ステータス行の検出
     */
    async detectStatLines(canvas) {
        const lines = [];
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // 水平方向の投影を計算（各行の文字密度）
        const horizontalProjection = new Array(height).fill(0);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                
                // 文字らしいピクセル（中程度の明度）をカウント
                if (gray > 50 && gray < 200) {
                    horizontalProjection[y]++;
                }
            }
        }

        // ピークを検出してステータス行を特定
        const minLineHeight = 15;
        const minTextDensity = width * 0.05; // 行幅の5%以上の文字密度
        
        let inLine = false;
        let lineStart = 0;
        
        for (let y = 0; y < height; y++) {
            const density = horizontalProjection[y];
            
            if (!inLine && density > minTextDensity) {
                // 新しい行の開始
                inLine = true;
                lineStart = y;
            } else if (inLine && density <= minTextDensity) {
                // 行の終了
                const lineHeight = y - lineStart;
                
                if (lineHeight >= minLineHeight) {
                    lines.push({
                        y: lineStart,
                        height: lineHeight,
                        x: 0,
                        width: width,
                        density: horizontalProjection.slice(lineStart, y).reduce((a, b) => a + b, 0)
                    });
                }
                
                inLine = false;
            }
        }

        return lines.sort((a, b) => b.density - a.density); // 密度順でソート
    }

    /**
     * 単一ステータス行の認識
     */
    async recognizeStatLine(canvas, line, gameType) {
        // 行領域を抽出
        const lineCanvas = this.extractRegion(canvas, line);
        
        // 行を左右に分割（ステータス名 | 数値）
        const nameWidth = Math.floor(lineCanvas.width * 0.6);  // 60%がステータス名
        const valueWidth = lineCanvas.width - nameWidth;        // 40%が数値
        
        // ステータス名部分
        const nameCanvas = this.extractRegion(lineCanvas, {
            x: 0, y: 0, width: nameWidth, height: lineCanvas.height
        });
        
        // 数値部分  
        const valueCanvas = this.extractRegion(lineCanvas, {
            x: nameWidth, y: 0, width: valueWidth, height: lineCanvas.height
        });

        // 並行してOCR実行
        const [nameResult, valueResult] = await Promise.all([
            this.recognizeStatName(nameCanvas, gameType),
            this.recognizeStatValue(valueCanvas, gameType)
        ]);

        return {
            name: nameResult.text,
            value: valueResult.value,
            confidence: Math.min(nameResult.confidence, valueResult.confidence),
            rawText: `${nameResult.text} ${valueResult.value}`
        };
    }

    /**
     * ステータス名の認識
     */
    async recognizeStatName(canvas, gameType) {
        if (!canvas) return { text: '', confidence: 0 };

        try {
            let processedCanvas = this.cloneCanvas(canvas);
            
            // ステータス名用の前処理
            processedCanvas = this.scaleCanvas(processedCanvas, 2.5);
            
            if (this.isOpenCVReady) {
                processedCanvas = await this.extractStatNameColor(processedCanvas, gameType);
            }
            
            const gameConfig = this.gameConfigs[gameType];
            const charWhitelist = gameConfig?.ocr_settings?.tesseract_config?.tessedit_char_whitelist || 
                "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー・";
            
            const ocrConfig = {
                psm: 8,
                tessedit_char_whitelist: charWhitelist
            };

            const { data: { text, confidence } } = await Tesseract.recognize(
                processedCanvas,
                'jpn',
                { 
                    logger: m => {
                        if (m.status === 'recognizing') {
                            console.log('📛 ステータス名認識中:', (m.progress * 100).toFixed(0) + '%');
                        }
                    },
                    ...ocrConfig 
                }
            );

            const normalizedText = this.normalizeStatName(text.trim(), gameType);
            console.log(`✓ ステータス名: "${normalizedText}" (信頼度: ${Math.round(confidence)}%)`);

            return {
                text: normalizedText,
                confidence: confidence / 100
            };
        } catch (error) {
            console.warn('ステータス名OCRエラー:', error.message);
            return { text: '', confidence: 0 };
        }
    }

    /**
     * ステータス値の認識
     */
    async recognizeStatValue(canvas, gameType) {
        if (!canvas) return { value: '', confidence: 0 };

        try {
            let processedCanvas = this.cloneCanvas(canvas);
            
            // 数値用の前処理（より積極的に処理）
            processedCanvas = this.scaleCanvas(processedCanvas, 2.5);
            processedCanvas = await this.numericPreprocessing(processedCanvas, gameType);
            
            const ocrConfig = {
                psm: 7, // 単一テキスト行
                tessedit_char_whitelist: '0123456789.,%+−'
            };

            const { data: { text, confidence } } = await Tesseract.recognize(
                processedCanvas,
                'eng',
                { 
                    logger: m => {
                        if (m.status === 'recognizing') {
                            console.log('🔢 数値認識中:', (m.progress * 100).toFixed(0) + '%');
                        }
                    },
                    ...ocrConfig 
                }
            );

            const normalizedValue = this.normalizeNumericText(text.trim());
            console.log(`✓ ステータス値: "${normalizedValue}" (信頼度: ${Math.round(confidence)}%)`);

            return {
                value: normalizedValue,
                confidence: confidence / 100
            };
        } catch (error) {
            console.warn('ステータス値OCRエラー:', error.message);
            return { value: '', confidence: 0 };
        }
    }

    /**
     * 音骸名前の色抽出（高精度化）
     */
    async extractItemNameColor(canvas, gameType) {
        if (!this.isOpenCVReady) {
            // フォールバック
            return this.extractItemNameColorCPU(canvas, gameType);
        }

        try {
            const src = cv.imread(canvas);
            const hsv = new cv.Mat();
            cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

            // ゲーム別の色范囲設定
            const colorRanges = {
                '鳴潮': {
                    lower1: new cv.Scalar(35, 100, 100),   // 金色下限
                    upper1: new cv.Scalar(45, 255, 255),   // 金色上限
                    lower2: new cv.Scalar(0, 0, 180),      // 白色下限
                    upper2: new cv.Scalar(180, 30, 255)    // 白色上限
                }
            };

            const range = colorRanges[gameType] || colorRanges['鳴潮'];
            
            // 金色マスク
            const mask1 = new cv.Mat();
            cv.inRange(hsv, range.lower1, range.upper1, mask1);

            // 白色マスク
            const mask2 = new cv.Mat();
            cv.inRange(hsv, range.lower2, range.upper2, mask2);

            // マスクを統合
            const combinedMask = new cv.Mat();
            cv.bitwise_or(mask1, mask2, combinedMask);

            // オリジナル画像にマスク適用
            const result = new cv.Mat();
            cv.bitwise_and(src, src, result, combinedMask);

            // Canvas に出力
            const dstCanvas = document.createElement('canvas');
            cv.imshow(dstCanvas, result);

            // メモリ解放
            src.delete();
            hsv.delete();
            mask1.delete();
            mask2.delete();
            combinedMask.delete();
            result.delete();

            return dstCanvas;
        } catch (error) {
            console.warn('extractItemNameColor OpenCV エラー:', error);
            return this.extractItemNameColorCPU(canvas, gameType);
        }
    }

    /**
     * CPU ベースの音骸名前色抽出（フォールバック）
     */
    extractItemNameColorCPU(canvas, gameType) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const [h, s, v] = this.rgbToHsv(r, g, b);

            let isItemName = false;
            
            if (gameType === '鳴潮') {
                // 音骸名前は金色(35-45°)または白色
                isItemName = (
                    (h >= 35 && h <= 45 && s > 100 && v > 100) ||  // 金色
                    (s < 30 && v > 180)                             // 白色
                );
            }

            if (isItemName) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
            } else {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * ステータス名の色抽出
     */
    async extractStatNameColor(canvas, gameType) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const [h, s, v] = this.rgbToHsv(r, g, b);

            let isStatName = false;
            
            if (gameType === '鳴潮') {
                // ステータス名は白色系
                isStatName = (s < 40 && v > 140);
            }

            if (isStatName) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
            } else {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * 文字強調処理（名前用）
     */
    enhanceTextForName(canvas) {
        // モルフォロジー処理で文字を太くする
        if (this.isOpenCVReady) {
            return this.morphologyClose(canvas, 2);
        } else {
            // フォールバック: シンプルなぼかし
            return this.gaussianBlur(canvas, 1.0);
        }
    }

    /**
     * ステータス名の正規化
     */
    normalizeStatName(text, gameType) {
        const gameConfig = this.gameConfigs[gameType];
        if (!gameConfig || !gameConfig.stat_map) return text;
        
        // stat_mapを使用して名前を正規化
        const normalized = gameConfig.stat_map[text];
        return normalized || text;
    }

    /**
     * Gaussian blur実装（フォールバック用）
     */
    gaussianBlur(canvas, sigma) {
        const ctx = canvas.getContext('2d');
        ctx.filter = `blur(${sigma}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        return canvas;
    }
}