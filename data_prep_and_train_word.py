# data_prep_and_train_word.py - 単語・数値ベースのOCRモデル訓練
import cv2
import json
import pathlib
import random
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

SCREEN_W, SCREEN_H = 1920, 1080
TARGET_W = 128  # 幅
TARGET_H = 32   # 高さ
OUT_DIR = pathlib.Path("dataset_words")

# 単語・数値パターンのクラスリスト（実際の画像から取得した文字列）
CLASSES = [
    # キャラクター名（例）
    "ビッグベア", "小さな子羊", "アンコール", "今汐", "カカロ",
    # COST関連
    "COST", "1", "2", "3", "4",
    # レベル
    "+0", "+5", "+10", "+15", "+20", "+25",
    # メインステータス名
    "凝縮ダメージアップ", "攻撃力", "防御力", "HP", "会心率", "会心ダメージ",
    "エネルギー回復効率", "属性ダメージアップ",
    # サブステータス名
    "攻撃力", "攻撃力%", "防御力", "防御力%", "HP", "HP%",
    "クリティカル", "クリティカルダメージ", "会心率", "会心ダメージ",
    "共鳴解放ダメージアップ", "共鳴スキルダメージアップ", "通常攻撃ダメージアップ",
    "重撃ダメージアップ", "エネルギー回復効率",
    # 数値パターン
    "30.0%", "100", "9.4%", "15.0%", "9.9%", "8.6%", "7.1%",
    "50", "75", "150", "200", "10%", "20%", "25%",
    "12.0%", "18.0%", "6.0%", "4.5%",
    # その他
    "", "---"  # 空白・認識失敗用
]
NUM_CLASSES = len(CLASSES)
CLASS_TO_ID = {c: i for i, c in enumerate(CLASSES)}

# 単語・数値ベースの座標定義（添付画像の右側ステータス）
# 実際の座標は annotator.html で測定してください
WORD_BOXES = [
    # キャラクター名エリア（上部）
    {"label": "キャラ名", "type": "text", "x": 1015, "y": 105, "w": 110, "h": 30},
    {"label": "COST表記", "type": "text", "x": 1015, "y": 128, "w": 80, "h": 22},
    {"label": "COST値", "type": "number", "x": 1100, "y": 128, "w": 30, "h": 22},
    {"label": "レベル", "type": "number", "x": 1015, "y": 150, "w": 40, "h": 22},

    # メインステータス
    {"label": "メイン名", "type": "text", "x": 1015, "y": 172, "w": 200, "h": 28},
    {"label": "メイン値", "type": "number", "x": 1240, "y": 172, "w": 80, "h": 28},

    # サブステータス1
    {"label": "サブ1名", "type": "text", "x": 1015, "y": 205, "w": 120, "h": 26},
    {"label": "サブ1値", "type": "number", "x": 1255, "y": 205, "w": 65, "h": 26},

    # サブステータス2
    {"label": "サブ2名", "type": "text", "x": 1015, "y": 230, "w": 100, "h": 26},
    {"label": "サブ2値", "type": "number", "x": 1255, "y": 230, "w": 65, "h": 26},

    # サブステータス3
    {"label": "サブ3名", "type": "text", "x": 1015, "y": 255, "w": 170, "h": 26},
    {"label": "サブ3値", "type": "number", "x": 1240, "y": 255, "w": 80, "h": 26},

    # サブステータス4
    {"label": "サブ4名", "type": "text", "x": 1015, "y": 280, "w": 130, "h": 26},
    {"label": "サブ4値", "type": "number", "x": 1255, "y": 280, "w": 65, "h": 26},

    # サブステータス5
    {"label": "サブ5名", "type": "text", "x": 1015, "y": 302, "w": 200, "h": 26},
    {"label": "サブ5値", "type": "number", "x": 1240, "y": 302, "w": 80, "h": 26},

    # サブステータス6（存在する場合）
    {"label": "サブ6名", "type": "text", "x": 1015, "y": 325, "w": 200, "h": 26},
    {"label": "サブ6値", "type": "number", "x": 1240, "y": 325, "w": 80, "h": 26},
]

def extract_words(img_path):
  """画像から単語・数値パッチを抽出"""
  img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
  if img is None:
    return []

  h, w = img.shape
  sx, sy = w / SCREEN_W, h / SCREEN_H
  patches = []

  for box in WORD_BOXES:
    x, y, bw, bh = box["x"], box["y"], box["w"], box["h"]
    xs, ys = int(x * sx), int(y * sy)
    ws, hs = int(bw * sx), int(bh * sy)

    crop = img[ys:ys + hs, xs:xs + ws]

    # アスペクト比を保持してリサイズ
    target_h = TARGET_H
    target_w = int(ws * target_h / hs) if hs > 0 else TARGET_W
    target_w = min(target_w, TARGET_W)

    resized = cv2.resize(crop, (target_w, target_h),
                         interpolation=cv2.INTER_AREA)

    # パディングして固定サイズに
    padded = np.zeros((target_h, TARGET_W), dtype=np.uint8)
    padded[:, :target_w] = resized

    patches.append((box["label"], padded))

  return patches

def augment(patch):
  """データ拡張"""
  # ランダムな輝度調整
  scale = random.uniform(0.8, 1.2)
  patch = np.clip(patch * scale, 0, 255).astype(np.uint8)

  # ランダムなガウシアンノイズ
  if random.random() < 0.3:
    noise = np.random.normal(0, 3, patch.shape)
    patch = np.clip(patch + noise, 0, 255).astype(np.uint8)

  return patch

def load_dataset(img_paths, aug_per_image=5):
  """データセットを構築"""
  X, Y = [], []

  for img_path in img_paths:
    patches = extract_words(str(img_path))

    for label, patch in patches:
      # オリジナル
      X.append(patch.astype(np.float32) / 255.0)
      Y.append(CLASS_TO_ID.get(label, CLASS_TO_ID[""]))  # 未知の場合は空白

      # 拡張データ
      for _ in range(aug_per_image):
        aug_patch = augment(patch)
        X.append(aug_patch.astype(np.float32) / 255.0)
        Y.append(CLASS_TO_ID.get(label, CLASS_TO_ID[""]))

  X = np.array(X).reshape(-1, TARGET_H, TARGET_W, 1)
  Y = tf.keras.utils.to_categorical(Y, NUM_CLASSES)

  return X, Y

def build_model():
  """単語認識用のCNNモデル（より大きな入力用）"""
  model = keras.Sequential([
      layers.Input(shape=(TARGET_H, TARGET_W, 1)),

      # 畳み込み層（より深いネットワーク）
      layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
      layers.MaxPooling2D((2, 2)),
      layers.Dropout(0.25),

      layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
      layers.MaxPooling2D((2, 2)),
      layers.Dropout(0.25),

      layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
      layers.MaxPooling2D((2, 2)),
      layers.Dropout(0.25),

      # 全結合層
      layers.Flatten(),
      layers.Dense(256, activation='relu'),
      layers.Dropout(0.5),
      layers.Dense(128, activation='relu'),
      layers.Dropout(0.3),
      layers.Dense(NUM_CLASSES, activation='softmax')
  ])

  model.compile(
      optimizer='adam',
      loss='categorical_crossentropy',
      metrics=['accuracy']
  )

  return model

def main():
  # トレーニング画像を検索
  img_paths = list(pathlib.Path(".").glob("*.png")) + \
      list(pathlib.Path(".").glob("*.jpg"))

  if not img_paths:
    print("❌ トレーニング用の画像が見つかりません。")
    print("   ゲームのステータス画面スクリーンショット（1920x1080推奨）を")
    print("   このディレクトリに配置してください。")
    return

  print(f"📸 画像数: {len(img_paths)}")
  print(f"📦 クラス数: {NUM_CLASSES}")
  print(f"📐 入力サイズ: {TARGET_H}x{TARGET_W}")

  # データセット構築
  print("\n🔄 データセット構築中...")
  X, Y = load_dataset(img_paths, aug_per_image=10)
  print(f"✓ サンプル数: {len(X)}")

  # モデル構築
  print("\n🏗️ モデル構築中...")
  model = build_model()
  model.summary()

  # トレーニング
  print("\n🚀 トレーニング開始...")
  history = model.fit(
      X, Y,
      batch_size=32,
      epochs=30,
      validation_split=0.15,
      verbose=1
  )

  # 保存
  model.save("ocr_model_word.keras")
  print("\n✓ モデル保存完了: ocr_model_word.keras")

  # クラスリスト保存
  OUT_DIR.mkdir(exist_ok=True)
  with open(OUT_DIR / "classes.json", "w", encoding="utf-8") as f:
    json.dump(CLASSES, f, ensure_ascii=False, indent=2)
  print(f"✓ クラスリスト保存: {OUT_DIR}/classes.json")

  # 最終精度
  final_acc = history.history['accuracy'][-1]
  final_val_acc = history.history.get('val_accuracy', [0])[-1]
  print(f"\n📊 最終精度: {final_acc*100:.2f}% (検証: {final_val_acc*100:.2f}%)")

if __name__ == "__main__":
  main()
