# data_prep_and_train.py
import cv2, json, pathlib, random, numpy as np, tensorflow as tf

SCREEN_W, SCREEN_H = 1920, 1080
TARGET = 18
OUT_DIR = pathlib.Path("dataset")
CLASSES = ["0","1","2","3","4","5","6","7","8","9","％","会心","攻撃"]
NUM_CLASSES = len(CLASSES)
CLASS_TO_ID = {c:i for i,c in enumerate(CLASSES)}

# Define character bounding boxes at 1920x1080; each is (name, x, y, w, h)
CHAR_BOXES = [
    ("digit0", 1500, 200, 24, 32),
    # add all positions for each glyph you need
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
    model.save("ocr_model.h5")
    # TFJS with weight quantization
    import subprocess, sys
    subprocess.check_call([
        sys.executable, "-m", "tensorflowjs_converter",
        "--input_format=keras",
        "--quantization_bytes=1",  # 1-byte weights
        "ocr_model.h5", "web_model"
    ])
    with open("web_model/classes.json", "w", encoding="utf-8") as f:
        json.dump(CLASSES, f, ensure_ascii=False)

if __name__ == "__main__":
    main()