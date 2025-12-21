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
# クラスリスト読み込み（ファイルが無い場合はフォールバック）
try:
  with open("web_model/classes.json", "r", encoding="utf-8") as f:
    CLASSES = json.load(f)
except FileNotFoundError:
  CLASSES = [
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%", ".",
      "C", "O", "S", "T",
      "ビ", "ッ", "グ", "ベ", "ア",
      "凝", "縮", "ダ", "メ", "ー", "ジ", "プ",
      "攻", "撃", "力",
      "ク", "リ", "テ", "ィ", "カ", "ル",
      "共", "鳴", "解", "放",
      "ス", "キ"
  ]

# 座標定義（文字単位）- annotator.htmlでアノテーションした座標
BOXES_1080P = [
    {"name": "ビ", "x": 1425, "y": 145, "w": 30, "h": 35},
    {"name": "ッ", "x": 1454, "y": 151, "w": 23, "h": 29},
    {"name": "グ", "x": 1476, "y": 145, "w": 32, "h": 35},
    {"name": "ベ", "x": 1507, "y": 146, "w": 28, "h": 34},
    {"name": "ア", "x": 1533, "y": 146, "w": 28, "h": 34},
    {"name": "C", "x": 1432, "y": 181, "w": 21, "h": 25},
    {"name": "O", "x": 1450, "y": 180, "w": 19, "h": 25},
    {"name": "S", "x": 1466, "y": 180, "w": 18, "h": 26},
    {"name": "T", "x": 1481, "y": 181, "w": 20, "h": 25},
    {"name": "3", "x": 1502, "y": 181, "w": 19, "h": 24},
    {"name": "凝", "x": 1456, "y": 238, "w": 24, "h": 29},
    {"name": "縮", "x": 1478, "y": 238, "w": 23, "h": 29},
    {"name": "ダ", "x": 1499, "y": 236, "w": 21, "h": 30},
    {"name": "メ", "x": 1518, "y": 241, "w": 20, "h": 28},
    {"name": "ー", "x": 1536, "y": 241, "w": 24, "h": 26},
    {"name": "ジ", "x": 1559, "y": 238, "w": 20, "h": 29},
    {"name": "ア", "x": 1576, "y": 239, "w": 23, "h": 30},
    {"name": "ッ", "x": 1597, "y": 242, "w": 19, "h": 25},
    {"name": "プ", "x": 1613, "y": 239, "w": 26, "h": 28},
    {"name": "3", "x": 1741, "y": 239, "w": 21, "h": 30},
    {"name": "0", "x": 1758, "y": 238, "w": 19, "h": 29},
    {"name": "0", "x": 1781, "y": 238, "w": 17, "h": 29},
    {"name": "%", "x": 1793, "y": 236, "w": 25, "h": 30},
    {"name": "攻", "x": 1455, "y": 273, "w": 28, "h": 33},
    {"name": "撃", "x": 1480, "y": 273, "w": 27, "h": 33},
    {"name": "力", "x": 1502, "y": 275, "w": 31, "h": 32},
    {"name": "1", "x": 1769, "y": 275, "w": 18, "h": 32},
    {"name": "0", "x": 1787, "y": 275, "w": 17, "h": 29},
    {"name": "0", "x": 1801, "y": 276, "w": 16, "h": 27},
    {"name": "攻", "x": 1438, "y": 315, "w": 28, "h": 32},
    {"name": "撃", "x": 1465, "y": 313, "w": 24, "h": 34},
    {"name": "力", "x": 1487, "y": 315, "w": 24, "h": 32},
    {"name": "9", "x": 1759, "y": 315, "w": 21, "h": 28},
    {"name": "4", "x": 1781, "y": 318, "w": 18, "h": 25},
    {"name": "%", "x": 1799, "y": 313, "w": 19, "h": 31},
    {"name": ".", "x": 1775, "y": 331, "w": 12, "h": 12},
    {"name": "ク", "x": 1441, "y": 347, "w": 22, "h": 29},
    {"name": "リ", "x": 1462, "y": 347, "w": 24, "h": 30},
    {"name": "テ", "x": 1483, "y": 347, "w": 28, "h": 30},
    {"name": "ィ", "x": 1507, "y": 349, "w": 23, "h": 27},
    {"name": "カ", "x": 1527, "y": 347, "w": 27, "h": 29},
    {"name": "ル", "x": 1553, "y": 349, "w": 23, "h": 28},
    {"name": "ダ", "x": 1573, "y": 347, "w": 26, "h": 30},
    {"name": "メ", "x": 1597, "y": 346, "w": 22, "h": 31},
    {"name": "ー", "x": 1618, "y": 344, "w": 25, "h": 35},
    {"name": "ジ", "x": 1642, "y": 343, "w": 26, "h": 36},
    {"name": "1", "x": 1746, "y": 346, "w": 18, "h": 30},
    {"name": "5", "x": 1762, "y": 346, "w": 16, "h": 28},
    {"name": "0", "x": 1781, "y": 349, "w": 18, "h": 27},
    {"name": "%", "x": 1796, "y": 344, "w": 22, "h": 33},
    {"name": "ク", "x": 1438, "y": 380, "w": 28, "h": 33},
    {"name": "リ", "x": 1463, "y": 380, "w": 24, "h": 34},
    {"name": "テ", "x": 1483, "y": 379, "w": 26, "h": 34},
    {"name": "ィ", "x": 1507, "y": 383, "w": 23, "h": 30},
    {"name": "カ", "x": 1529, "y": 379, "w": 25, "h": 35},
    {"name": "ル", "x": 1551, "y": 377, "w": 22, "h": 37},
    {"name": "9", "x": 1758, "y": 379, "w": 20, "h": 29},
    {"name": ".", "x": 1772, "y": 393, "w": 14, "h": 15},
    {"name": "9", "x": 1783, "y": 380, "w": 16, "h": 30},
    {"name": "%", "x": 1796, "y": 380, "w": 24, "h": 31},
    {"name": "共", "x": 1440, "y": 414, "w": 26, "h": 30},
    {"name": "鳴", "x": 1465, "y": 413, "w": 22, "h": 31},
    {"name": "解", "x": 1484, "y": 413, "w": 24, "h": 32},
    {"name": "放", "x": 1508, "y": 413, "w": 22, "h": 34},
    {"name": "ダ", "x": 1530, "y": 414, "w": 21, "h": 34},
    {"name": "メ", "x": 1550, "y": 414, "w": 25, "h": 30},
    {"name": "ー", "x": 1573, "y": 414, "w": 26, "h": 28},
    {"name": "ジ", "x": 1597, "y": 414, "w": 24, "h": 28},
    {"name": "ア", "x": 1619, "y": 414, "w": 26, "h": 30},
    {"name": "ッ", "x": 1643, "y": 414, "w": 20, "h": 31},
    {"name": "プ", "x": 1663, "y": 414, "w": 29, "h": 33},
    {"name": "8", "x": 1759, "y": 410, "w": 19, "h": 32},
    {"name": ".", "x": 1774, "y": 428, "w": 13, "h": 13},
    {"name": "6", "x": 1783, "y": 414, "w": 16, "h": 27},
    {"name": "%", "x": 1795, "y": 414, "w": 23, "h": 25},
    {"name": "共", "x": 1440, "y": 444, "w": 26, "h": 31},
    {"name": "鳴", "x": 1462, "y": 445, "w": 28, "h": 30},
    {"name": "ス", "x": 1486, "y": 447, "w": 25, "h": 27},
    {"name": "キ", "x": 1508, "y": 447, "w": 25, "h": 28},
    {"name": "ル", "x": 1527, "y": 447, "w": 26, "h": 27},
    {"name": "ダ", "x": 1551, "y": 445, "w": 27, "h": 29},
    {"name": "メ", "x": 1575, "y": 444, "w": 22, "h": 31},
    {"name": "ー", "x": 1594, "y": 448, "w": 27, "h": 26},
    {"name": "ジ", "x": 1616, "y": 441, "w": 27, "h": 33},
    {"name": "ア", "x": 1640, "y": 447, "w": 25, "h": 30},
    {"name": "ッ", "x": 1660, "y": 447, "w": 31, "h": 28},
    {"name": "プ", "x": 1689, "y": 444, "w": 20, "h": 30},
    {"name": "7", "x": 1765, "y": 441, "w": 13, "h": 33},
    {"name": ".", "x": 1775, "y": 460, "w": 11, "h": 12},
    {"name": "1", "x": 1784, "y": 445, "w": 14, "h": 30},
    {"name": "%", "x": 1795, "y": 445, "w": 23, "h": 32},
]

# 文字認識用の小さな入力サイズ
TARGET = 18

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
    resized = cv2.resize(crop, (TARGET, TARGET), interpolation=cv2.INTER_AREA)
    norm = resized.astype(np.float32) / 255.0

    input_tensor = norm.reshape(1, TARGET, TARGET, 1)
    pred = model.predict(input_tensor, verbose=0)
    idx = np.argmax(pred[0])
    confidence = float(pred[0][idx])
    predicted_text = CLASSES[idx]

    predictions.append(predicted_text)
    results.append({
        "index": i,
        "expected": box["name"],
        "predicted": predicted_text,
        "confidence": round(confidence * 100, 2),
        "match": box["name"] == predicted_text,
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
    matched = sum(1 for r in results if r["match"])
    accuracy = (matched / total * 100) if total > 0 else 0
    avg_confidence = sum(r["confidence"]
                         for r in results) / total if total > 0 else 0

    return jsonify({
        'predictions': preds,
        'results': results,
        'score': score,
        'stats': {
            'total': total,
            'matched': matched,
            'accuracy': round(accuracy, 2),
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
