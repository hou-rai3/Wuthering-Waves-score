// ===================================================================
// アプリケーション本体
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const gameSelect = document.getElementById('game-select');
    const characterSelect = document.getElementById('character-select');
    const charLabel = document.getElementById('character-label');
    const canvasContainer = document.getElementById('canvas-container');
    const imageCanvas = document.getElementById('image-canvas');
    const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
    const infoOverlay = document.getElementById('info-overlay');
    const pasteLabel = document.getElementById('paste-label');
    const loaderOverlay = document.getElementById('loader-overlay');
    const loaderText = document.getElementById('loader-text');
    const showProcessedCheck = document.getElementById('show-processed-check');
    const itemNameTitleLabel = document.getElementById('item-name-title-label');
    const itemNameLabel = document.getElementById('item-name-label');
    const resultTable = document.getElementById('result-table');
    const formulaLabel = document.getElementById('formula-label');
    const scoreLabel = document.getElementById('score-label');

    // --- アプリケーションの状態管理 ---
    let originalImage = null;
    let currentConfig = null;
    let fuse = null;

    // --- OCRワーカーの初期化 ---
    let ocrWorker = null;
    async function initializeOcrWorker() {
        loaderText.textContent = 'OCRエンジンを準備中...';
        loaderOverlay.style.display = 'flex';
        ocrWorker = await Tesseract.createWorker('jpn', 1, {
            logger: m => console.log(m)
        });
        loaderOverlay.style.display = 'none';
        console.log('Tesseract Worker Initialized');
    }
    initializeOcrWorker();

    // --- 初期化処理 ---
    function initialize() {
        // ゲーム選択肢を生成
        Object.keys(GAME_CONFIGS).forEach(gameName => {
            const option = document.createElement('option');
            option.value = gameName;
            option.textContent = gameName;
            gameSelect.appendChild(option);
        });
        gameSelect.value = Object.keys(GAME_CONFIGS)[0]; // 初期ゲームを設定
        onGameChange();
        setupDragAndDrop();
    }

    // --- イベントリスナー ---
    gameSelect.addEventListener('change', onGameChange);
    characterSelect.addEventListener('change', processAndDisplay);
    showProcessedCheck.addEventListener('change', displayImage);
    window.addEventListener('paste', handlePaste);

    // --- ゲーム変更時の処理 ---
    function onGameChange() {
        const gameName = gameSelect.value;
        currentConfig = GAME_CONFIGS[gameName];

        // UIのラベルなどを更新
        document.title = currentConfig.title;
        charLabel.textContent = currentConfig.character_label;
        pasteLabel.textContent = currentConfig.paste_label;
        itemNameTitleLabel.textContent = currentConfig.recognized_item_label;

        // キャラクター/ビルド選択肢を更新
        characterSelect.innerHTML = '';
        const charBuilds = currentConfig.character_builds;
        Object.keys(charBuilds).forEach(charName => {
            const option = document.createElement('option');
            option.value = charName;
            option.textContent = charName;
            characterSelect.appendChild(option);
        });

        // Fuzzy Search (あいまい検索) の設定
        const statKeys = Object.keys(currentConfig.stat_map);
        fuse = new Fuse(statKeys, { includeScore: true, threshold: 0.5 });

        resetResults();
        processAndDisplay(); // ゲーム変更時にも再計算・表示を行う
    }

    // --- 画像処理 & 表示関連 ---
    function handleImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                infoOverlay.style.display = 'none';
                imageCanvas.classList.remove('hidden');
                processAndDisplay();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImage(file);
                break;
            }
        }
    }

    function setupDragAndDrop() {
        canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            canvasContainer.classList.add('border-[#FFD700]', 'bg-black/70');
        });
        canvasContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            canvasContainer.classList.remove('border-[#FFD700]', 'bg-black/70');
        });
        canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            canvasContainer.classList.remove('border-[#FFD700]', 'bg-black/70');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleImage(files[0]);
            }
        });
    }

    // --- メイン処理 ---
    async function processAndDisplay() {
        if (!originalImage || !ocrWorker) return;
        resetResults();
        displayImage();

        loaderText.textContent = 'OCRでステータスを認識中...';
        loaderOverlay.style.display = 'flex';

        try {
            const statsCropArea = currentConfig.stats_crop_area;
            const processedCanvas = await preprocessForOcr(originalImage, statsCropArea, currentConfig.ocr_settings);
            
            const { data: { text } } = await ocrWorker.recognize(processedCanvas, {}, currentConfig.ocr_settings.tesseract_config);

            const statsForCalc = parseStats(text);
            if (statsForCalc.length === 0) {
                alert(`ステータスを読み取れませんでした。\n\n[認識した元テキスト]:\n${text}`);
                return;
            }
            
            const build = currentConfig.character_builds[characterSelect.value];
            const { total_score, scored_stats, formula } = calculateScore(statsForCalc, build);
            
            displayResults(scored_stats, formula, total_score);

        } catch (error) {
            console.error("処理エラー:", error);
            alert("画像の解析中に予期せぬエラーが発生しました。");
        } finally {
            loaderOverlay.style.display = 'none';
            if (showProcessedCheck.checked) {
                displayImage();
            }
        }
    }

    // --- 画像表示と前処理 ---
    function displayImage() {
        if (!originalImage) {
            imageCanvas.classList.add('hidden');
            infoOverlay.style.display = 'flex';
            return;
        }

        imageCanvas.width = originalImage.width;
        imageCanvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);

        if (showProcessedCheck.checked) {
            const statsCropArea = currentConfig.stats_crop_area;
            preprocessForOcr(originalImage, statsCropArea, currentConfig.ocr_settings)
                .then(processedCanvas => {
                    ctx.drawImage(processedCanvas, statsCropArea[0], statsCropArea[1]);
                    drawBoundingBoxes();
                    fitCanvasToContainer();
                });
        } else {
            drawBoundingBoxes();
            fitCanvasToContainer();
        }
    }
    
    function drawBoundingBoxes() {
        if(currentConfig.item_name_crop_area) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 3;
            ctx.strokeRect(...currentConfig.item_name_crop_area);
        }
        if(currentConfig.stats_crop_area) {
            ctx.strokeStyle = "#FFD700"; // Gold
            ctx.lineWidth = 3;
            ctx.strokeRect(...currentConfig.stats_crop_area);
        }
    }
    
    function fitCanvasToContainer() {
        const ratio = Math.min(canvasContainer.clientWidth / imageCanvas.width, canvasContainer.clientHeight / imageCanvas.height);
        imageCanvas.style.width = `${imageCanvas.width * ratio}px`;
        imageCanvas.style.height = `${imageCanvas.height * ratio}px`;
    }

    async function preprocessForOcr(img, crop, settings) {
        const [x, y, w, h] = crop;
        const scale = 3.0;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w * scale;
        tempCanvas.height = h * scale;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
        
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            const inverted = 255 - avg;
            data[i] = inverted;
            data[i+1] = inverted;
            data[i+2] = inverted;
        }
        tempCtx.putImageData(imageData, 0, 0);

        const contrastImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const contrastData = contrastImageData.data;
        let min = 255, max = 0;
        for (let i = 0; i < contrastData.length; i += 4) {
            if (contrastData[i] < min) min = contrastData[i];
            if (contrastData[i] > max) max = contrastData[i];
        }
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < contrastData.length; i += 4) {
                const value = ((contrastData[i] - min) / range) * 255;
                const binary = value > settings.threshold ? 255 : 0;
                contrastData[i] = binary;
                contrastData[i+1] = binary;
                contrastData[i+2] = binary;
            }
        }
        tempCtx.putImageData(contrastImageData, 0, 0);

        return tempCanvas;
    }

    // --- パース & 計算 ---
    function findBestStatMatch(name) {
        const results = fuse.search(name.replace(/[+.\s]/g, ''));
        if (results.length > 0) {
            return results[0].item;
        }
        return null;
    }

    function parseStats(text) {
        let statsForCalc = [];
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
            const match = line.match(currentConfig.parsing_rules.regex);
            if (match) {
                const rawName = match[1].trim();
                const value = match[2].trim();
                
                const matchedName = findBestStatMatch(rawName);
                if(matchedName) {
                    const canonicalName = currentConfig.stat_map[matchedName];
                    let statKey = canonicalName;
                    if (currentConfig.parsing_rules.stat_types.includes(canonicalName)) {
                        statKey = value.includes('%') ? `${canonicalName}(%)` : `${canonicalName}(実数値)`;
                    }
                    statsForCalc.push([statKey, value]);
                }
            }
        }
        return statsForCalc;
    }

    function calculateScore(stats, build) {
        let total_score = 0;
        let scored_stats = [];
        let formula_parts = [];

        const mainMult = build.main || {};
        const subMult = build.sub || {};

        stats.forEach((stat, i) => {
            const [key, valueStr] = stat;
            let current_score = 0;
            let tag = 'sub';

            // 鳴潮のメインOPは特別処理
            if (i === 0 && gameSelect.value === "鳴潮") { 
                tag = 'main';
                if (mainMult[key] > 0) {
                    current_score = 15.0; // 鳴潮のメインOPは固定スコア
                }
            } else { // サブOPの処理 (全ゲーム共通)
                const numericValue = parseFloat(valueStr.replace('%', '').replace(',', '')) || 0;
                const multiplier = subMult[key] || 0;
                current_score = numericValue * multiplier;
            }
            
            total_score += current_score;
            if (current_score > 0.001) {
                formula_parts.push(current_score.toFixed(2));
            }
            scored_stats.push({ name: key, value: valueStr, score: current_score, tag });
        });

        const formula = formula_parts.length > 0 ? formula_parts.join(" + ") + ` = ${total_score.toFixed(2)}` : '計算対象ステータスがありません';
        return { total_score, scored_stats, formula };
    }

    // --- 結果表示 ---
    function resetResults() {
        itemNameLabel.textContent = '...';
        resultTable.innerHTML = '';
        formulaLabel.textContent = '計算式:';
        scoreLabel.textContent = '0';
    }

    function displayResults(scored_stats, formula, total_score) {
        resultTable.innerHTML = '';
        scored_stats.forEach(stat => {
            const row = document.createElement('div');
            const scoreColorClass = stat.score > 10 ? 'text-[#FFD700]' : stat.score > 5 ? 'text-[#a0a0a0]' : 'text-[#666]';
            const tagClass = stat.tag === 'main' ? 'bg-black/50 font-bold border-l-4 border-[#DAA520]' : 'bg-[#1c1c1c]/50';
            
            row.className = `grid grid-cols-3 gap-2 p-2 ${tagClass}`;
            row.innerHTML = `
                <span class="col-span-1 truncate">${stat.name}</span>
                <span class="text-center font-mono">${stat.value}</span>
                <span class="text-right font-mono ${scoreColorClass}">${stat.score.toFixed(2)}</span>
            `;
            resultTable.appendChild(row);
        });
        formulaLabel.textContent = `計算式: ${formula}`;
        scoreLabel.textContent = Math.round(total_score);
    }
    
    // アプリケーション起動
    initialize();
});
