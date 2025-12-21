/**
 * 鳴潮 音骸スコアチェッカー - メイン処理スクリプト
 * 機能：画像処理、OCR、スコア計算
 */

// ============================================
// グローバル変数
// ============================================

let openCVReady = false;
let tesseractReady = false;
let currentImage = null;
let currentResults = null;
let engineWaitTimerId = null;
let engineWaitDeadline = 0;

// FHD（1920x1080）を基準とした座標定義
const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

// 音骸ステータスの定義
const CHARACTER_STATS = {
    attack: { label: '攻撃力', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    hp: { label: 'HP', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    def: { label: '防御力', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    criRate: { label: '会心率', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    criDmg: { label: '会心ダメージ', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    healBonus: { label: 'ヒール効果', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } },
    resistance: { label: '全耐性', unit: '%', crop: { x: 0.65, y: 0.15, w: 0.30, h: 0.70 } }
};

// スコア計算の重み
const SCORE_WEIGHTS = {
    attack: 1.0,
    criRate: 2.0,
    criDmg: 1.0,
    def: 0.5,
    hp: 0.5,
    healBonus: 0.3,
    resistance: 0.8
};

// ============================================
// ローカルストレージ管理（設定・履歴）
// ============================================

const STORAGE_KEYS = {
    HISTORY: 'wuthering_score_history',
    SETTINGS: 'wuthering_score_settings'
};

class SettingsManager {
    constructor() {
        this.defaults = {
            cropX: 65,
            cropY: 15,
            cropW: 30,
            cropH: 70,
            weightAttack: 1.0,
            weightCriRate: 2.0,
            weightCriDmg: 1.0
        };
        this.current = this.load();
    }
    load() {
        const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return saved ? JSON.parse(saved) : { ...this.defaults };
    }
    save() {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.current));
    }
    reset() {
        this.current = { ...this.defaults };
        this.save();
    }
    get(key) {
        return this.current[key] ?? this.defaults[key];
    }
    set(key, value) {
        this.current[key] = value;
        this.save();
    }
}

class HistoryManager {
    constructor() {
        this.history = this.load();
    }
    load() {
        const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
        return saved ? JSON.parse(saved) : [];
    }
    save() {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history));
    }
    add(entry) {
        this.history.unshift({
            timestamp: new Date().toLocaleString('ja-JP'),
            score: entry.score,
            stats: entry.stats,
            id: Date.now()
        });
        this.history = this.history.slice(0, 100);
        this.save();
    }
    clear() {
        this.history = [];
        this.save();
    }
    get all() {
        return this.history;
    }
    remove(id) {
        this.history = this.history.filter(item => item.id !== id);
        this.save();
    }
}

// インスタンス生成（クラス定義後）
// settingsManager / historyManager をグローバルに用意
const settingsManager = new SettingsManager();
const historyManager = new HistoryManager();

// ============================================
// 初期化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('アプリケーション初期化中...');
    
    // OpenCV.jsのロード確認
    waitForOpenCV();
    
    // Tesseract.jsの初期化
    initTesseract();
    
    // 初期化の視覚化（両エンジンが未準備ならオーバーレイ開始）
    if (!enginesReady()) {
        startEngineOverlayWait(45000);
    }
    
    // イベントリスナー設定
    setupEventListeners();
});

/**
 * OpenCV.jsのロード完了を待機
 */
function waitForOpenCV() {
    const attachRuntimeHook = () => {
        try {
            if (typeof cv !== 'undefined') {
                cv['onRuntimeInitialized'] = () => {
                    console.log('OpenCV.js Runtime Initialized');
                    openCVReady = true;
                    renderEngineOverlay();
                };
            }
        } catch (e) {
            console.error('OpenCV runtime hook attach failed:', e);
        }
    };
    const checkInterval = setInterval(() => {
        if (typeof cv !== 'undefined') {
            attachRuntimeHook();
        }
        if (openCVReady) {
            console.log('OpenCV.js 準備完了');
            clearInterval(checkInterval);
            renderEngineOverlay();
        }
    }, 100);
    
    // タイムアウト（30秒）
    setTimeout(() => {
        if (!openCVReady) {
            console.warn('OpenCV.js ロード失敗 - タイムアウト');
        }
    }, 30000);
}

/**
 * Tesseract.jsの初期化
 */
async function initTesseract() {
    try {
        if (typeof Tesseract === 'undefined') {
            showError('Tesseract.js が読み込まれていません（CDNスクリプトを確認してください）');
            renderEngineOverlay();
            return;
        }
        const { createWorker } = Tesseract;
        // 絶対URLでローカルアセットを参照（ワーカーベースの相対解決不一致を回避）
        const baseHref = new URL('.', window.location.href).href;
        const localBase = new URL('assets/tesseract/', baseHref).href;
        const localWorker = new URL('assets/tesseract/worker.min.js', baseHref).href;
        const localCore = new URL('assets/tesseract/tesseract-core.wasm', baseHref).href;

        const configs = [
            // 優先: ローカルアセット（GitHub Pagesで自ホスト）
            {
                workerPath: localWorker,
                corePath: localCore,
                langPath: localBase
            },
            // フォールバック: CDN
            {
                workerPath: 'https://unpkg.com/tesseract.js@v5.1.0/dist/worker.min.js',
                corePath: 'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm',
                langPath: 'https://tessdata.projectnaptha.com/4.0.0'
            }
        ];

        let lastError = null;
        for (const cfg of configs) {
            try {
                // ローカルアセットの事前確認（HEAD）
                if (cfg.langPath === localBase) {
                    const headCore = await fetch(localCore, { method: 'HEAD' });
                    const headLang = await fetch(new URL('jpn.traineddata', localBase).href, { method: 'HEAD' });
                    if (!headCore.ok || !headLang.ok) {
                        console.warn('ローカルアセットが見つかりません。CDNへフォールバックします。', { core: headCore.status, lang: headLang.status });
                        throw new Error('Local assets not accessible');
                    }
                }
                const worker = await createWorker({
                    ...cfg,
                    logger: (m) => {
                        console.log(m);
                        setOverlayProgress(m);
                    }
                });
                await worker.load();
                await worker.loadLanguage('jpn');
                await worker.initialize('jpn');
                window.tesseractWorker = worker;
                console.log('Tesseract.js 初期化完了');
                tesseractReady = true;
                renderEngineOverlay();
                return;
            } catch (err) {
                console.warn('Tesseract初期化失敗（試行）:', cfg, err);
                lastError = err;
                try { await window.tesseractWorker?.terminate(); } catch {}
            }
        }
        throw lastError || new Error('Tesseract初期化に失敗しました');
    } catch (error) {
        console.error('Tesseract.js 初期化失敗:', error);
        showError('OCRエンジンの初期化に失敗しました');
        renderEngineOverlay();
    }
}

/**
 * 両エンジンの準備完了を待機
 */
function enginesReady() {
    return openCVReady && tesseractReady;
}

function waitForEnginesReady(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
            if (enginesReady()) {
                clearInterval(timer);
                resolve(true);
            } else if (Date.now() - started > timeoutMs) {
                clearInterval(timer);
                reject(new Error('エンジン初期化がタイムアウトしました'));
            }
        }, 100);
    });
}

// ============================================
// エンジン初期化の視覚的インジケータ
// ============================================
function ensureEngineOverlay() {
    let el = document.getElementById('engineOverlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'engineOverlay';
        el.style.position = 'fixed';
        el.style.left = '20px';
        el.style.bottom = '20px';
        el.style.zIndex = '9999';
        el.style.background = 'rgba(20,20,24,0.9)';
        el.style.border = '1px solid #3a3a40';
        el.style.borderRadius = '10px';
        el.style.padding = '12px 16px';
        el.style.color = '#e6e6ef';
        el.style.fontSize = '14px';
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
        el.innerHTML = `
            <div id="engineTitle" style="font-weight:600;margin-bottom:8px;">エンジン初期化中…</div>
            <div style="display:flex;gap:12px;margin-bottom:8px;">
                <div id="cvStatus">OpenCV: <span>-</span></div>
                <div id="ocrStatus">Tesseract: <span>-</span></div>
            </div>
            <div id="engineCountdown" style="opacity:0.85;">残り -- 秒</div>
            <div id="engineActions" style="margin-top:8px;display:none;">
                <button id="retryBtn" style="padding:6px 10px;border-radius:6px;border:1px solid #555;background:#2a2a32;color:#e6e6ef;cursor:pointer;">再試行</button>
            </div>
        `;
        document.body.appendChild(el);
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                initTesseract();
                waitForOpenCV();
                startEngineOverlayWait(20000);
            });
        }
    }
    return el;
}

function renderEngineOverlay() {
    const el = document.getElementById('engineOverlay');
    if (!el) return;
    const cvSpan = el.querySelector('#cvStatus span');
    const ocrSpan = el.querySelector('#ocrStatus span');
    const title = el.querySelector('#engineTitle');
    if (cvSpan) cvSpan.textContent = openCVReady ? '準備完了 ✓' : '初期化中…';
    if (ocrSpan) ocrSpan.textContent = tesseractReady ? '準備完了 ✓' : '初期化中…';
    if (title) title.textContent = enginesReady() ? 'エンジン準備完了' : 'エンジン初期化中…';
}

function setOverlayProgress(m) {
    const el = document.getElementById('engineOverlay');
    if (!el) return;
    const ocrSpan = el.querySelector('#ocrStatus span');
    const title = el.querySelector('#engineTitle');
    if (m?.status) {
        const pct = typeof m.progress === 'number' ? ` ${Math.round(m.progress * 100)}%` : '';
        if (ocrSpan) ocrSpan.textContent = `${m.status}${pct}`;
        if (title && !enginesReady()) title.textContent = 'エンジン初期化中…';
    }
}

function startEngineOverlayWait(timeoutMs) {
    const el = ensureEngineOverlay();
    engineWaitDeadline = Date.now() + timeoutMs;
    renderEngineOverlay();
    const countdownEl = el.querySelector('#engineCountdown');
    const actionsEl = el.querySelector('#engineActions');
    if (actionsEl) actionsEl.style.display = 'none';
    el.style.display = 'block';
    if (engineWaitTimerId) clearInterval(engineWaitTimerId);
    engineWaitTimerId = setInterval(() => {
        const remain = Math.max(0, Math.ceil((engineWaitDeadline - Date.now()) / 1000));
        if (countdownEl) countdownEl.textContent = enginesReady() ? '準備完了' : `残り ${remain} 秒`;
        renderEngineOverlay();
        if (enginesReady()) {
            stopEngineOverlayWait();
        }
        if (remain <= 0 && !enginesReady()) {
            const title = el.querySelector('#engineTitle');
            if (title) title.textContent = '初期化がタイムアウトしました';
            if (actionsEl) actionsEl.style.display = 'block';
            clearInterval(engineWaitTimerId);
            engineWaitTimerId = null;
        }
    }, 200);
}

function stopEngineOverlayWait() {
    const el = document.getElementById('engineOverlay');
    if (engineWaitTimerId) {
        clearInterval(engineWaitTimerId);
        engineWaitTimerId = null;
    }
    if (el) el.style.display = 'none';
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // ペースト イベント
    document.addEventListener('paste', handlePaste);
    // ドロップゾーン取得（ペースト/ドラッグ&ドロップ共通）
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) {
        showError('UI要素 dropzone が見つかりません（HTMLを確認してください）');
        return;
    }
    // ドロップゾーンにフォーカスしている場合のペーストも拾う
    dropzone.addEventListener('paste', handlePaste);
    
    // ドラッグ&ドロップ
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('active');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('active');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) {
                showError('画像ファイルのみ対応しています');
                return;
            }
            handleImageFile(file);
        }
    });
    
    // リセットボタン
    document.getElementById('resetBtn').addEventListener('click', reset);
    
    // ダウンロードボタン
    document.getElementById('downloadBtn').addEventListener('click', downloadResults);

    // 設定パネルのトグル
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsContent = document.getElementById('settingsContent');
    if (settingsBtn && settingsContent) {
        settingsBtn.addEventListener('click', () => {
            settingsContent.style.display = settingsContent.style.display === 'none' ? 'block' : 'none';
            settingsBtn.classList.toggle('active');
        });
    }

    // 設定のレンジスライダー
    ['cropX', 'cropY', 'cropW', 'cropH'].forEach(id => {
        const slider = document.getElementById(id);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const label = document.getElementById(id + 'Value');
                if (label) label.textContent = e.target.value;
                settingsManager.set(id, val);
            });
        }
    });

    ['weightAttack', 'weightCriRate', 'weightCriDmg'].forEach(id => {
        const slider = document.getElementById(id);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const label = document.getElementById(id + 'Value');
                if (label) label.textContent = val.toFixed(1);
                settingsManager.set(id, val);
            });
        }
    });

    // デフォルト設定へリセット
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            settingsManager.reset();
            initializeSettings();
        });
    }

    // 履歴管理ボタン
    const saveHistoryBtn = document.getElementById('saveHistoryBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (saveHistoryBtn) saveHistoryBtn.addEventListener('click', saveToHistory);
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

    // 初期化：設定値をUIに反映＆履歴ロード
    initializeSettings();
    loadHistory();

    // クリップボード読み取りボタン
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            await readClipboardImage();
        });
    }
}

// ============================================
// イメージ処理
// ============================================

/**
 * ペーストイベント処理
 */
async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            await handleImageFile(blob);
            break;
        }
    }
}

/**
 * 画像ファイル処理
 */
async function handleImageFile(file) {
    try {
        if (!enginesReady()) {
            showMessage('エンジン初期化中…準備完了次第処理します', 'success');
            try {
                startEngineOverlayWait(30000);
                await waitForEnginesReady(30000);
            } catch (e) {
                renderEngineOverlay();
                showError(e.message || 'エンジン初期化待機に失敗しました');
                return;
            }
        }
        // 念のためオーバーレイを閉じる
        stopEngineOverlayWait();
        showLoading(true);
        hideError();
        const img = new Image();
        img.onload = () => processImage(img);
        img.onerror = () => {
            showError('画像の読み込みに失敗しました');
            showLoading(false);
        };
        img.src = URL.createObjectURL(file);
    } catch (error) {
        console.error('画像処理エラー:', error);
        showError('画像の処理に失敗しました: ' + error.message);
        showLoading(false);
    }
}

/**
 * クリップボードから画像を読み取る（secure contextのみ）
 */
async function readClipboardImage() {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            showError('このブラウザはクリップボード画像の読み取りに未対応です');
            return;
        }
        const items = await navigator.clipboard.read();
        for (const item of items) {
            for (const type of item.types) {
                if (type.startsWith('image/')) {
                    const blob = await item.getType(type);
                    await handleImageFile(blob);
                    return;
                }
            }
        }
        showError('クリップボードに画像が見つかりません');
    } catch (err) {
        console.error('クリップボード読み取り失敗', err);
        showError('クリップボードから画像を取得できませんでした');
    }
}

/**
 * 設定値をUIに反映
 */
function initializeSettings() {
    ['cropX', 'cropY', 'cropW', 'cropH'].forEach(id => {
        const slider = document.getElementById(id);
        if (!slider) {
            console.warn(`設定スライダー要素が見つかりません: ${id}`);
            return;
        }
        const value = settingsManager.get(id);
        slider.value = value;
        const labelEl = document.getElementById(id + 'Value');
        if (labelEl) labelEl.textContent = value;
        else console.warn(`設定値ラベルが見つかりません: ${id}Value`);
    });

    ['weightAttack', 'weightCriRate', 'weightCriDmg'].forEach(id => {
        const slider = document.getElementById(id);
        if (!slider) {
            console.warn(`重みスライダー要素が見つかりません: ${id}`);
            return;
        }
        const value = settingsManager.get(id);
        slider.value = value;
        const labelEl = document.getElementById(id + 'Value');
        if (labelEl) labelEl.textContent = value.toFixed(1);
        else console.warn(`重みラベルが見つかりません: ${id}Value`);
    });
}
    // メッセージを消す
    hideError();
/**
 * 履歴をUIに表示
 */
function loadHistory() {
    const history = historyManager.all;
    if (history.length === 0) {
        return;
    }

    const historySection = document.getElementById('history-section');
    const historyList = document.getElementById('historyList');
    
    historyList.innerHTML = '';
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        const statsStr = Object.entries(item.stats || {})
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${v.toFixed(1)}`)
            .join('<br>');
        
        div.innerHTML = `
            <div class="history-time">${item.timestamp}</div>
            <div class="history-score">${item.score.total.toFixed(0)}</div>
            <div class="history-stats">${statsStr}</div>
            <div class="history-delete" onclick="deleteHistoryItem(${item.id})">×</div>
        `;
        
        historyList.appendChild(div);
    });

    historySection.style.display = 'block';
}
        
/**
 * 現在の結果を履歴に保存
 */
function saveToHistory() {
    if (!currentResults) {
        showError('保存する結果がありません');
        return;
    }

    historyManager.add(currentResults);
    loadHistory();
    showError('結果を履歴に保存しました'); // 実装後はトーストに変更
}
/**
 * 履歴アイテムを削除
 */
function deleteHistoryItem(id) {
    historyManager.remove(id);
    loadHistory();
}
/**
 * 履歴をクリア
 */
function clearHistory() {
    if (!confirm('履歴をすべて削除してもよろしいですか？')) {
        return;
    }
    historyManager.clear();
    loadHistory();
}
        

/**
 * 画像処理メイン処理
 */
async function processImage(img) {
    try {
        console.time('processImage');
        // 元の画像をCanvasに描画
        const originalCanvas = document.getElementById('originalCanvas');
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx.drawImage(img, 0, 0);
        
        // スケーリング計算
        const scale = img.width / REFERENCE_WIDTH;
        
        // ステータス領域のクロップと処理
        const stats = await processStatusArea(img, scale);
        
        // Tesseract.jsでOCR
        const results = await performOCR(img, scale);
        
        // スコア計算
        const score = calculateScore(results);
        
        // 結果表示
        displayResults(results, score);
        
        currentResults = { stats, results, score };
        
    } catch (error) {
        console.error('画像処理失敗:', error);
        showError('画像の処理に失敗しました: ' + error.message);
    } finally {
        showLoading(false);
        document.getElementById('preview-section').style.display = 'block';
        console.timeEnd('processImage');
    }
}

/**
 * ステータス領域の処理
 */
async function processStatusArea(img, scale) {
    if (!openCVReady) return null;
    try {
        // 元のMatを作成
        const src = cv.imread(document.getElementById('originalCanvas'));
        
        // グレースケール化
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // 二値化（Otsu）
        const binary = new cv.Mat();
        cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        
        // ノイズ除去（モルフォロジー演算）
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
        const denoised = new cv.Mat();
        cv.morphologyEx(binary, denoised, cv.MORPH_OPEN, kernel);
        
        // 設定値を使用してクロップ領域を計算（範囲チェック付き）
        let cropX = Math.floor(img.width * (settingsManager.get('cropX') / 100));
        let cropY = Math.floor(img.height * (settingsManager.get('cropY') / 100));
        let cropW = Math.floor(img.width * (settingsManager.get('cropW') / 100));
        let cropH = Math.floor(img.height * (settingsManager.get('cropH') / 100));

        // 画像境界に収まるようにクランプ
        cropX = Math.max(0, Math.min(cropX, img.width - 1));
        cropY = Math.max(0, Math.min(cropY, img.height - 1));
        cropW = Math.max(1, Math.min(cropW, img.width - cropX));
        cropH = Math.max(1, Math.min(cropH, img.height - cropY));
        console.log('Crop Rect:', { cropX, cropY, cropW, cropH });
        
        // クロップ
        const roi = denoised.roi(new cv.Rect(cropX, cropY, cropW, cropH));
        
        // 処理済み画像をCanvasに表示
        const processedCanvas = document.getElementById('processedCanvas');
        processedCanvas.width = cropW;
        processedCanvas.height = cropH;
        cv.imshow(processedCanvas, roi);
        
        // クロップ画像を別Canvasに表示
        const croppedCanvas = document.getElementById('croppedCanvas');
        croppedCanvas.width = cropW;
        croppedCanvas.height = cropH;
        const croppedCtx = croppedCanvas.getContext('2d');
        croppedCtx.imageSmoothingEnabled = false;
        croppedCtx.drawImage(document.getElementById('originalCanvas'),
            cropX, cropY, cropW, cropH,
            0, 0, cropW, cropH);
        
        // メモリ解放
        src.delete();
        gray.delete();
        binary.delete();
        denoised.delete();
        kernel.delete();
        roi.delete();
        
        return { cropX, cropY, cropW, cropH };
    } catch (error) {
        console.error('ステータス領域処理エラー:', error);
        showError('ステータス領域の処理に失敗しました: ' + (error?.message || error));
        return null;
    }
}

/**
 * Tesseract.jsでOCR実行
 */
async function performOCR(img, scale) {
    if (!tesseractReady) {
        showError('OCRエンジンが準備できていません');
        return null;
    }
    
    try {
        const croppedCanvas = document.getElementById('croppedCanvas');
        
        // OCR実行
        const result = await window.tesseractWorker.recognize(croppedCanvas, 'jpn');
        let text = result.data.text;
        text = sanitizeOCRText(text);
        
        console.log('OCR結果:', text);
        
        // テキスト解析
        const stats = parseOCRText(text);
        
        return stats;
        
    } catch (error) {
        console.error('OCRエラー:', error);
        showError('テキスト認識に失敗しました');
        return null;
    }
}

/**
 * OCRテキストの解析
 */
function parseOCRText(text) {
    const stats = {};
    
    // 日本語での項目名と数値を正規表現で抽出
    const patterns = {
        attack: { regex: /攻撃力[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'attack' },
        hp: { regex: /HP[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'hp' },
        def: { regex: /防御力[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'def' },
        criRate: { regex: /会心率[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'criRate' },
        criDmg: { regex: /会心ダメージ[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'criDmg' },
        healBonus: { regex: /ヒール効果[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'healBonus' },
        resistance: { regex: /全耐性[：:]\s*(\d+(?:\.\d+)?)%?/, key: 'resistance' }
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern.regex);
        if (match) {
            stats[pattern.key] = parseFloat(match[1]) || 0;
        } else {
            stats[pattern.key] = 0;
        }
    }
    
    // フォールバック：行ごとに解析
    if (Object.values(stats).every(v => v === 0)) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        
        lines.forEach((line, index) => {
            // 次の行の数字を抽出
            if (index + 1 < lines.length) {
                const nextValue = parseFloat(lines[index + 1]);
                if (!isNaN(nextValue)) {
                    if (line.includes('攻撃力')) stats.attack = nextValue;
                    else if (line.includes('HP')) stats.hp = nextValue;
                    else if (line.includes('防御力')) stats.def = nextValue;
                    else if (line.includes('会心率')) stats.criRate = nextValue;
                    else if (line.includes('会心ダメージ')) stats.criDmg = nextValue;
                    else if (line.includes('ヒール効果')) stats.healBonus = nextValue;
                    else if (line.includes('全耐性')) stats.resistance = nextValue;
                }
            }
        });
    }
    
    return stats;
}

/**
 * OCRテキストのサニタイズ（全角→半角、O→0, I/l→1 等）
 */
function sanitizeOCRText(text) {
    if (!text) return '';
    // 全角数字・記号を半角に変換
    const zenkaku = '０１２３４５６７８９％：．';
    const hankaku = '0123456789%:.';
    let converted = text.replace(/[０-９％：．]/g, (s) => {
        const idx = zenkaku.indexOf(s);
        return idx >= 0 ? hankaku[idx] : s;
    });
    // 誤認識の補正
    converted = converted
        .replace(/[Oo]/g, '0')
        .replace(/[Il]/g, '1');
    // パーセントの表記ゆれを統一
    converted = converted.replace(/％/g, '%');
    return converted;
}

// ============================================
// スコア計算
// ============================================

/**
 * スコア計算メイン関数（設定重み対応）
 */

function calculateScore(stats) {
    if (!stats) return 0;
    
    let score = 0;
    const breakdown = {};
    
    // 設定マネージャーから重み値を取得
    const weights = {
        ...SCORE_WEIGHTS,
        attack: settingsManager.get('weightAttack'),
        criRate: settingsManager.get('weightCriRate'),
        criDmg: settingsManager.get('weightCriDmg')
    };
    
    for (const [key, weight] of Object.entries(weights)) {
        const value = stats[key] || 0;
        const contribution = value * weight;
        score += contribution;
        breakdown[key] = contribution;
    }
    
    // 小数点第2位で四捨五入
    score = Math.round(score * 100) / 100;
    
    return { total: score, breakdown };
}
// ============================================
// UI表示
// ============================================

/**
 * 結果を画面に表示
 */
function displayResults(stats, scoreData) {
    if (!stats) return;
    
    // ステータス表示
    const statusGrid = document.getElementById('statusGrid');
    statusGrid.innerHTML = '';
    
    for (const [key, info] of Object.entries(CHARACTER_STATS)) {
        if (stats[key] !== undefined) {
            const value = stats[key];
            const statusItem = document.createElement('div');
            statusItem.className = 'status-item';
            statusItem.innerHTML = `
                <div class="status-label">${info.label}</div>
                <div class="status-value">${value.toFixed(2)}</div>
                <div class="status-unit">${info.unit}</div>
            `;
            statusGrid.appendChild(statusItem);
        }
    }
    
    document.getElementById('results-section').style.display = 'block';
    
    // スコア表示
    document.getElementById('scoreValue').textContent = scoreData.total.toFixed(0);
    
    const breakdownList = document.getElementById('scoreBreakdown');
    breakdownList.innerHTML = '';
    
    for (const [key, value] of Object.entries(scoreData.breakdown)) {
        if (value > 0) {
            const item = document.createElement('div');
            item.className = 'breakdown-item';
            const label = CHARACTER_STATS[key]?.label || key;
            item.innerHTML = `
                <span class="breakdown-label">${label}</span>
                <span class="breakdown-value">+${value.toFixed(2)}</span>
            `;
            breakdownList.appendChild(item);
        }
    }
    
    document.getElementById('score-section').style.display = 'block';
}

/**
 * ローディング表示制御
 */
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

/**
 * エラーメッセージ表示
 */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    console.error('[UI Error]', message);
}

/**
 * エラーメッセージ非表示
 */
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

/**
 * メッセージ表示（汎用）
 */
function showMessage(message, type = 'error') {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    if (type === 'error') {
        errorDiv.className = 'error-message';
    } else if (type === 'success') {
        errorDiv.className = 'error-message success-message';
    }
    
    // 3秒後に自動非表示
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}
// ============================================
// ユーティリティ関数
// ============================================

/**
 * リセット処理
 */
function reset() {
    // UI非表示
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('score-section').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    
    // キャンバスクリア
    ['originalCanvas', 'croppedCanvas', 'processedCanvas'].forEach(id => {
        const canvas = document.getElementById(id);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    
    // データクリア
    currentImage = null;
    currentResults = null;
}

/**
 * 結果をダウンロード
 */
function downloadResults() {
    if (!currentResults) return;
    
    const data = {
        timestamp: new Date().toLocaleString('ja-JP'),
        stats: currentResults.results,
        score: currentResults.score
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `音骸スコア_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// ページ終了時のクリーンアップ
// ============================================

window.addEventListener('beforeunload', () => {
    if (window.tesseractWorker) {
        window.tesseractWorker.terminate();
    }
});

// ============================================
// グローバルエラーハンドラ（原因の特定を支援）
// ============================================
window.addEventListener('error', (event) => {
    const msg = `予期せぬエラー: ${event.message} (${event.filename}:${event.lineno})`;
    console.error('GlobalError:', event.error || event.message);
    showMessage(msg, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason);
    console.error('UnhandledRejection:', event.reason);
    showMessage(`予期せぬ非同期エラー: ${reason}`, 'error');
});
