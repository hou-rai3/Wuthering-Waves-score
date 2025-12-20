// ===================================================================
// 軽量版高精度OCRアプリケーション
// GitHub Pages対応 - 実用性重視
// ===================================================================

import { GAME_CONFIGS } from './config.js';
import { LightweightHybridOCR } from './hybrid-ocr.js';

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
    let hybridOCR = null;
    let performanceStats = new Map();

    // --- 軽量OCRシステムの初期化 ---
    async function initializeLightweightOCR() {
        loaderText.textContent = 'OCRシステム初期化中...';
        loaderOverlay.style.display = 'flex';
        
        try {
            hybridOCR = new LightweightHybridOCR();
            await hybridOCR.initializeSystem();
            console.log('Lightweight OCR System ready');
        } catch (error) {
            console.error('OCR initialization failed:', error);
            showNotification('OCRシステムの初期化に失敗しました。基本機能のみ使用します。', 'warning');
        } finally {
            loaderOverlay.style.display = 'none';
        }
    }

    // システム初期化
    initializeLightweightOCR().then(() => {
        initialize();
    });

    // --- 通知システム ---
    function showNotification(message, type = 'info') {
        const colors = {
            success: 'bg-green-600/90',
            error: 'bg-red-600/90', 
            warning: 'bg-yellow-600/90',
            info: 'bg-blue-600/90'
        };
        
        const notification = document.createElement('div');
        notification.className = `${colors[type]} text-white p-3 fixed top-4 right-4 z-50 rounded shadow-lg max-w-sm`;
        notification.innerHTML = `
            <div class="flex justify-between items-center">
                <p class="text-sm">${message}</p>
                <button class="ml-2 text-white/70 hover:text-white" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // --- パフォーマンス測定 ---
    function recordPerformance(method, processingTime, accuracy) {
        if (!performanceStats.has(method)) {
            performanceStats.set(method, []);
        }
        
        performanceStats.get(method).push({
            time: processingTime,
            accuracy: accuracy,
            timestamp: Date.now()
        });
        
        // 過去1時間のデータのみ保持
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        performanceStats.set(method, 
            performanceStats.get(method).filter(stat => stat.timestamp > oneHourAgo)
        );
    }

    function getPerformanceReport() {
        const report = {};
        for (const [method, stats] of performanceStats) {
            if (stats.length > 0) {
                const avgTime = stats.reduce((sum, s) => sum + s.time, 0) / stats.length;
                const avgAccuracy = stats.reduce((sum, s) => sum + s.accuracy, 0) / stats.length;
                report[method] = {
                    count: stats.length,
                    avgTime: Math.round(avgTime),
                    avgAccuracy: Math.round(avgAccuracy * 100)
                };
            }
        }
        return report;
    }

    // --- 初期化処理 ---
    function initialize() {
        // パフォーマンス情報を表示するボタンを追加
        createPerformanceButton();
        
        // ゲーム選択肢を生成
        Object.keys(GAME_CONFIGS).forEach(gameName => {
            const option = document.createElement('option');
            option.value = gameName;
            option.textContent = gameName;
            gameSelect.appendChild(option);
        });
        gameSelect.value = Object.keys(GAME_CONFIGS)[0];
        onGameChange();
        setupDragAndDrop();
    }

    function createPerformanceButton() {
        const perfButton = document.createElement('button');
        perfButton.className = 'fixed bottom-4 left-4 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-xs z-40';
        perfButton.textContent = 'パフォーマンス';
        perfButton.onclick = showPerformanceModal;
        document.body.appendChild(perfButton);
    }

    function showPerformanceModal() {
        const report = getPerformanceReport();
        
        let reportHTML = '<h3 class="font-bold mb-2">パフォーマンス統計</h3>';
        
        if (Object.keys(report).length === 0) {
            reportHTML += '<p class="text-gray-400">データがありません</p>';
        } else {
            for (const [method, stats] of Object.entries(report)) {
                reportHTML += `
                    <div class="mb-2 p-2 bg-gray-800 rounded">
                        <div class="font-semibold">${method}</div>
                        <div class="text-sm text-gray-300">
                            回数: ${stats.count} | 
                            平均時間: ${stats.avgTime}ms | 
                            平均精度: ${stats.avgAccuracy}%
                        </div>
                    </div>
                `;
            }
        }
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-900 text-white p-6 rounded max-w-md w-full mx-4">
                ${reportHTML}
                <button class="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" onclick="this.parentElement.parentElement.remove()">
                    閉じる
                </button>
            </div>
        `;
        document.body.appendChild(modal);
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

        document.title = currentConfig.title;
        charLabel.textContent = currentConfig.character_label;
        pasteLabel.textContent = currentConfig.paste_label;
        itemNameTitleLabel.textContent = currentConfig.recognized_item_label;

        characterSelect.innerHTML = '';
        const charBuilds = currentConfig.character_builds;
        Object.keys(charBuilds).forEach(charName => {
            const option = document.createElement('option');
            option.value = charName;
            option.textContent = charName;
            characterSelect.appendChild(option);
        });

        const statKeys = Object.keys(currentConfig.stat_map);
        fuse = new Fuse(statKeys, { includeScore: true, threshold: 0.5 });

        resetResults();
        processAndDisplay();
    }

    // --- 画像処理関連 ---
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

    // --- メイン処理（ハイブリッド方式） ---
    async function processAndDisplay() {
        if (!originalImage) return;
        resetResults();
        displayImage();

        const startTime = Date.now();
        loaderText.textContent = 'ハイブリッドOCRで解析中...';
        loaderOverlay.style.display = 'flex';

        try {
            let recognizedStats = [];
            let method = 'fallback';
            
            if (hybridOCR && hybridOCR.isOpenCVReady) {
                // ハイブリッド方式
                method = 'hybrid';
                recognizedStats = await hybridOCR.recognizeGameStats(imageCanvas, gameSelect.value);
                loaderText.textContent = 'ハイブリッド認識完了...';
            } 
            
            // フォールバック: 従来の方式
            if (recognizedStats.length === 0) {
                method = 'fallback';
                recognizedStats = await fallbackRecognition();
                loaderText.textContent = '従来方式で認識完了...';
            }

            const processingTime = Date.now() - startTime;
            
            if (recognizedStats.length === 0) {
                showNotification('ステータスを認識できませんでした。画像を確認してください。', 'error');
                recordPerformance(method, processingTime, 0);
                return;
            }
            
            // スコア計算と表示
            const statsForCalc = recognizedStats.map(stat => [stat.statName, stat.value]);
            const build = currentConfig.character_builds[characterSelect.value];
            const { total_score, scored_stats, formula } = calculateScore(statsForCalc, build);
            
            displayResults(scored_stats, formula, total_score);
            
            // 成功率の計算（認識できたスタッツ数/期待スタッツ数）
            const expectedStats = Object.keys(build.sub || {}).length + Object.keys(build.main || {}).length;
            const accuracy = Math.min(recognizedStats.length / Math.max(expectedStats, 4), 1.0);
            
            recordPerformance(method, processingTime, accuracy);
            
            // 低精度の警告
            const avgConfidence = recognizedStats.reduce((sum, s) => sum + (s.confidence || 0.5), 0) / recognizedStats.length;
            if (avgConfidence < 0.7) {
                showNotification(`認識精度: ${Math.round(avgConfidence * 100)}% - 結果を確認してください`, 'warning');
            }

        } catch (error) {
            console.error("処理エラー:", error);
            showNotification("画像の解析中にエラーが発生しました。", 'error');
            recordPerformance(method, Date.now() - startTime, 0);
        } finally {
            loaderOverlay.style.display = 'none';
            if (showProcessedCheck.checked) {
                displayImage();
            }
        }
    }

    async function fallbackRecognition() {
        // 従来のOCR処理（フォールバック）
        const statsCropArea = currentConfig.stats_crop_area;
        const processedCanvas = await simplePreprocess(originalImage, statsCropArea, currentConfig.ocr_settings);
        
        const { data: { text } } = await Tesseract.recognize(
            processedCanvas, 
            'jpn', 
            currentConfig.ocr_settings.tesseract_config
        );
        
        const parsedStats = parseStats(text);
        return parsedStats.map(([key, value]) => ({
            statName: key,
            value: value,
            confidence: 0.6,
            method: 'fallback'
        }));
    }

    async function simplePreprocess(img, crop, settings) {
        // 従来の前処理（軽量版）
        const [x, y, w, h] = crop;
        const scale = 2.0; // 3.0から2.0に軽量化

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w * scale;
        tempCanvas.height = h * scale;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
        
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        // グレースケール変換 + 二値化
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i+1] + data[i+2]) / 3;
            const binary = gray > settings.threshold ? 255 : 0;
            data[i] = binary;
            data[i+1] = binary;
            data[i+2] = binary;
        }
        
        tempCtx.putImageData(imageData, 0, 0);
        return tempCanvas;
    }

    // --- 画像表示 ---
    function displayImage() {
        if (!originalImage) {
            imageCanvas.classList.add('hidden');
            infoOverlay.style.display = 'flex';
            return;
        }

        imageCanvas.width = originalImage.width;
        imageCanvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);

        drawBoundingBoxes();
        fitCanvasToContainer();
    }
    
    function drawBoundingBoxes() {
        if(currentConfig.item_name_crop_area) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 3;
            ctx.strokeRect(...currentConfig.item_name_crop_area);
        }
        if(currentConfig.stats_crop_area) {
            ctx.strokeStyle = "#FFD700";
            ctx.lineWidth = 3;
            ctx.strokeRect(...currentConfig.stats_crop_area);
        }
    }
    
    function fitCanvasToContainer() {
        const ratio = Math.min(canvasContainer.clientWidth / imageCanvas.width, canvasContainer.clientHeight / imageCanvas.height);
        imageCanvas.style.width = `${imageCanvas.width * ratio}px`;
        imageCanvas.style.height = `${imageCanvas.height * ratio}px`;
    }

    // --- パース & 計算（既存コードと同様） ---
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

            if (i === 0 && gameSelect.value === "鳴潮") { 
                tag = 'main';
                if (mainMult[key] > 0) {
                    current_score = 15.0;
                }
            } else {
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
});