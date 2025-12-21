# Flask APIサーバー（軽量推論サーバー）
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import json
import cv2
import base64
from io import BytesIO
from PIL import Image

app = Flask(__name__)
CORS(app)  # CORS有効化

# モデルとクラスリスト読み込み
print("モデル読み込み中...")
model = tf.keras.models.load_model("ocr_model.keras")
with open("web_model/classes.json", "r", encoding="utf-8") as f:
  CLASSES = json.load(f)

# 座標定義（単語・数値単位）- 添付画像の右側ステータスエリア用
# 実際の画像をannotator.htmlで測定して更新してください
BOXES_1080P = [
    # キャラクター名エリア（上部）
    {"name": "キャラ名", "type": "text", "x": 1015, "y": 105, "w": 110, "h": 30},
    {"name": "COST表記", "type": "text", "x": 1015, "y": 128, "w": 80, "h": 22},
    {"name": "COST値", "type": "number", "x": 1100, "y": 128, "w": 30, "h": 22},
    {"name": "レベル", "type": "number", "x": 1015, "y": 150, "w": 40, "h": 22},

    # メインステータス
    {"name": "メイン名", "type": "text", "x": 1015, "y": 172, "w": 200, "h": 28},
    {"name": "メイン値", "type": "number", "x": 1240, "y": 172, "w": 80, "h": 28},

    # サブステータス1
    {"name": "サブ1名", "type": "text", "x": 1015, "y": 205, "w": 120, "h": 26},
    {"name": "サブ1値", "type": "number", "x": 1255, "y": 205, "w": 65, "h": 26},

    # サブステータス2
    {"name": "サブ2名", "type": "text", "x": 1015, "y": 230, "w": 100, "h": 26},
    {"name": "サブ2値", "type": "number", "x": 1255, "y": 230, "w": 65, "h": 26},

    # サブステータス3
    {"name": "サブ3名", "type": "text", "x": 1015, "y": 255, "w": 170, "h": 26},
    {"name": "サブ3値", "type": "number", "x": 1240, "y": 255, "w": 80, "h": 26},

    # サブステータス4
    {"name": "サブ4名", "type": "text", "x": 1015, "y": 280, "w": 130, "h": 26},
    {"name": "サブ4値", "type": "number", "x": 1255, "y": 280, "w": 65, "h": 26},

    # サブステータス5
    {"name": "サブ5名", "type": "text", "x": 1015, "y": 302, "w": 200, "h": 26},
    {"name": "サブ5値", "type": "number", "x": 1240, "y": 302, "w": 80, "h": 26},

    # サブステータス6（存在する場合）
    {"name": "サブ6名", "type": "text", "x": 1015, "y": 325, "w": 200, "h": 26},
    {"name": "サブ6値", "type": "number", "x": 1240, "y": 325, "w": 80, "h": 26},
]

# 単語認識用の大きな入力サイズ
TARGET_W = 128  # 幅
TARGET_H = 32   # 高さ

def process_image(image_base64):
  import time
  start_time = time.time()

  # Base64 → numpy配列
  img_data = base64.b64decode(image_base64.split(',')[1])
  img = Image.open(BytesIO(img_data))
  img_array = np.array(img)

  h, w = img_array.shape[:2]
  sx, sy = w / 1920, h / 1080

  gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
  predictions = []
  results = []  # 詳細結果

  for i, box in enumerate(BOXES_1080P):
    x, y, bw, bh = box["x"], box["y"], box["w"], box["h"]
    xs, ys = int(x * sx), int(y * sy)
    ws, hs = int(bw * sx), int(bh * sy)

    crop = gray[ys:ys + hs, xs:xs + ws]

    # 可変サイズに対応：アスペクト比を保持しながらリサイズ
    target_h = TARGET_H
    target_w = int(ws * target_h / hs) if hs > 0 else TARGET_W
    target_w = min(target_w, TARGET_W)  # 最大幅制限

    resized = cv2.resize(crop, (target_w, target_h),
                         interpolation=cv2.INTER_AREA)

    # パディングして固定サイズに
    padded = np.zeros((target_h, TARGET_W), dtype=np.float32)
    padded[:, :target_w] = resized.astype(np.float32) / 255.0

    input_tensor = padded.reshape(1, target_h, TARGET_W, 1)
    pred = model.predict(input_tensor, verbose=0)
    idx = np.argmax(pred[0])
    confidence = float(pred[0][idx])
    predicted_text = CLASSES[idx]

    predictions.append(predicted_text)
    results.append({
        "index": i,
        "label": box["name"],
        "type": box.get("type", "text"),
        "predicted": predicted_text,
        "confidence": round(confidence * 100, 2),
        "box": {"x": x, "y": y, "w": bw, "h": bh}
    })

  elapsed = time.time() - start_time
  return predictions, results, elapsed

@app.route('/predict', methods=['POST'])
def predict():
  try:
    data = request.json
    image_data = data.get('image')

    if not image_data:
      return jsonify({'error': '画像データがありません'}), 400

    preds, results, elapsed = process_image(image_data)

    # スコア計算（簡易版）
    score = sum(1 for p in preds if p.isdigit())

    # 精度統計
    total = len(results)
    avg_confidence = sum(r["confidence"]
                         for r in results) / total if total > 0 else 0

    return jsonify({
        'predictions': preds,
        'results': results,
        'score': score,
        'stats': {
            'total': total,
            'avg_confidence': round(avg_confidence, 2),
            'elapsed_ms': round(elapsed * 1000, 2)
        }
    })
  except Exception as e:
    import traceback
    return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/')
def index():
  return "OCR Server Running. Use POST /predict with image data."

if __name__ == '__main__':
  print("✓ サーバー起動: http://localhost:5000")
  app.run(debug=True, port=5000)
