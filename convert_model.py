import os
from pathlib import Path

os.chdir(os.path.dirname(__file__))

print("Keras形式をTensorFlow.js形式に変換中...")
try:
    from tensorflowjs import converter
    converter.convert_keras("ocr_model.keras", "web_model", quantization_dtype=None)
    print("✓ 変換完了: web_model/")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()



