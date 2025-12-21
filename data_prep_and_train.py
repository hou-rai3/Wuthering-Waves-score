# data_prep_and_train.py
import cv2, json, pathlib, random, numpy as np, tensorflow as tf

SCREEN_W, SCREEN_H = 1920, 1080
TARGET = 18
OUT_DIR = pathlib.Path("dataset")
CLASSES = ["0","1","2","3","4","5","6","7","8","9","%",".","C","O","S","T",
           "ビ","ッ","グ","ベ","ア","凝","縮","ダ","メ","ー","ジ","プ",
           "攻","撃","力","ク","リ","テ","ィ","カ","ル","共","鳴","解","放","ス","キ"]
NUM_CLASSES = len(CLASSES)
CLASS_TO_ID = {c:i for i,c in enumerate(CLASSES)}

# Define character bounding boxes at 1920x1080; each is (name, x, y, w, h)
CHAR_BOXES = [
    ("ビ", 1425, 145, 30, 35),
    ("ッ", 1454, 151, 23, 29),
    ("グ", 1476, 145, 32, 35),
    ("ベ", 1507, 146, 28, 34),
    ("ア", 1533, 146, 28, 34),
    ("C", 1432, 181, 21, 25),
    ("O", 1450, 180, 19, 25),
    ("S", 1466, 180, 18, 26),
    ("T", 1481, 181, 20, 25),
    ("3", 1502, 181, 19, 24),
    ("凝", 1456, 238, 24, 29),
    ("縮", 1478, 238, 23, 29),
    ("ダ", 1499, 236, 21, 30),
    ("メ", 1518, 241, 20, 28),
    ("ー", 1536, 241, 24, 26),
    ("ジ", 1559, 238, 20, 29),
    ("ア", 1576, 239, 23, 30),
    ("ッ", 1597, 242, 19, 25),
    ("プ", 1613, 239, 26, 28),
    ("3", 1741, 239, 21, 30),
    ("0", 1758, 238, 19, 29),
    ("0", 1781, 238, 17, 29),
    ("%", 1793, 236, 25, 30),
    ("攻", 1455, 273, 28, 33),
    ("撃", 1480, 273, 27, 33),
    ("力", 1502, 275, 31, 32),
    ("1", 1769, 275, 18, 32),
    ("0", 1787, 275, 17, 29),
    ("0", 1801, 276, 16, 27),
    ("攻", 1438, 315, 28, 32),
    ("撃", 1465, 313, 24, 34),
    ("力", 1487, 315, 24, 32),
    ("9", 1759, 315, 21, 28),
    ("4", 1781, 318, 18, 25),
    ("%", 1799, 313, 19, 31),
    (".", 1775, 331, 12, 12),
    ("ク", 1441, 347, 22, 29),
    ("リ", 1462, 347, 24, 30),
    ("テ", 1483, 347, 28, 30),
    ("ィ", 1507, 349, 23, 27),
    ("カ", 1527, 347, 27, 29),
    ("ル", 1553, 349, 23, 28),
    ("ダ", 1573, 347, 26, 30),
    ("メ", 1597, 346, 22, 31),
    ("ー", 1618, 344, 25, 35),
    ("ジ", 1642, 343, 26, 36),
    ("1", 1746, 346, 18, 30),
    ("5", 1762, 346, 16, 28),
    ("0", 1781, 349, 18, 27),
    ("%", 1796, 344, 22, 33),
    ("ク", 1438, 380, 28, 33),
    ("リ", 1463, 380, 24, 34),
    ("テ", 1483, 379, 26, 34),
    ("ィ", 1507, 383, 23, 30),
    ("カ", 1529, 379, 25, 35),
    ("ル", 1551, 377, 22, 37),
    ("9", 1758, 379, 20, 29),
    (".", 1772, 393, 14, 15),
    ("9", 1783, 380, 16, 30),
    ("%", 1796, 380, 24, 31),
    ("共", 1440, 414, 26, 30),
    ("鳴", 1465, 413, 22, 31),
    ("解", 1484, 413, 24, 32),
    ("放", 1508, 413, 22, 34),
    ("ダ", 1530, 414, 21, 34),
    ("メ", 1550, 414, 25, 30),
    ("ー", 1573, 414, 26, 28),
    ("ジ", 1597, 414, 24, 28),
    ("ア", 1619, 414, 26, 30),
    ("ッ", 1643, 414, 20, 31),
    ("プ", 1663, 414, 29, 33),
    ("8", 1759, 410, 19, 32),
    (".", 1774, 428, 13, 13),
    ("6", 1783, 414, 16, 27),
    ("%", 1795, 414, 23, 25),
    ("共", 1440, 444, 26, 31),
    ("鳴", 1462, 445, 28, 30),
    ("ス", 1486, 447, 25, 27),
    ("キ", 1508, 447, 25, 28),
    ("ル", 1527, 447, 26, 27),
    ("ダ", 1551, 445, 27, 29),
    ("メ", 1575, 444, 22, 31),
    ("ー", 1594, 448, 27, 26),
    ("ジ", 1616, 441, 27, 33),
    ("ア", 1640, 447, 25, 30),
    ("ッ", 1660, 447, 31, 28),
    ("プ", 1689, 444, 20, 30),
    ("7", 1765, 441, 13, 33),
    (".", 1775, 460, 11, 12),
    ("1", 1784, 445, 14, 30),
    ("%", 1795, 445, 23, 32),
]

def ensure_dirs():
    for c in CLASSES:
        (OUT_DIR / c).mkdir(parents=True, exist_ok=True)

def extract_chars(img_path):
    img = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    sx, sy = w / SCREEN_W, h / SCREEN_H  # scale for non-1080p inputs
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    for name, x, y, cw, ch in CHAR_BOXES:
        xs, ys, ws, hs = int(x*sx), int(y*sy), int(cw*sx), int(ch*sy)
        crop = gray[ys:ys+hs, xs:xs+ws]
        resized = cv2.resize(crop, (TARGET, TARGET), interpolation=cv2.INTER_AREA)
        norm = resized.astype(np.float32) / 255.0
        yield name, norm

def augment(img):
    # small jitter + noise to disambiguate 3/8 etc.
    if random.random() < 0.5:
        img = np.roll(img, shift=random.choice([-1,1]), axis=random.choice([0,1]))
    if random.random() < 0.3:
        img = np.clip(img + np.random.normal(0, 0.05, img.shape), 0, 1)
    return img

def load_dataset(screens_dir):
    xs, ys = [], []
    for p in pathlib.Path(screens_dir).glob("*.png"):
        for name, arr in extract_chars(p):
            label = name if name in CLASSES else None
            if label is None: 
                continue
            arr = augment(arr)
            xs.append(arr[..., None])
            ys.append(CLASS_TO_ID[label])
    xs, ys = np.stack(xs), tf.keras.utils.to_categorical(ys, NUM_CLASSES)
    return xs, ys

def build_model():
    inputs = tf.keras.Input(shape=(TARGET, TARGET, 1))
    x = tf.keras.layers.Conv2D(16, 3, activation="relu", padding="same")(inputs)
    x = tf.keras.layers.MaxPool2D()(x)
    x = tf.keras.layers.Conv2D(32, 3, activation="relu", padding="same")(x)
    x = tf.keras.layers.MaxPool2D()(x)
    x = tf.keras.layers.Flatten()(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    outputs = tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model

def main():
    ensure_dirs()
    xs, ys = load_dataset("screenshots")  # put your captures here
    model = build_model()
    model.fit(xs, ys, validation_split=0.1, epochs=15, batch_size=64, shuffle=True)
    # Keras形式で保存
    model.save("ocr_model.keras")
    print("\n✓ モデル学習完了: ocr_model.keras")
    with open("web_model/classes.json", "w", encoding="utf-8") as f:
        json.dump(CLASSES, f, ensure_ascii=False)
    print("✓ classes.json 生成完了")

if __name__ == "__main__":
    main()