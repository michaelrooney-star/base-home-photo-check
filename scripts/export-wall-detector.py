"""Builds public/models/wall-objects.onnx: an open-vocabulary object detector for meter-wall photos.

YOLOE-11M (Ultralytics, AGPL-3.0) with its text prompts baked in, so the browser needs no text encoder.
Only the detection output is kept (the segmentation branch is pruned) and weights are int8-quantized (~24 MB).

  pip install ultralytics onnx onnxslim onnxruntime "git+https://github.com/ultralytics/CLIP.git"
  python scripts/export-wall-detector.py

Weights come from github.com/ultralytics/assets releases (yoloe-11m-seg.pt, mobileclip_blt.ts), not Hugging Face.
The class list must match WALL_OBJECT_CLASSES in src/lib/wall/objects.ts.
"""
import json, os, shutil, tempfile
import onnx
from onnx.utils import extract_model
from onnxruntime.quantization import quantize_dynamic, QuantType
from ultralytics import YOLOE

CLASSES = ["electric meter", "electrical enclosure", "metal electrical box", "air conditioner condenser",
           "hvac unit", "gas meter", "window", "door"]
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'wall-objects.onnx'))

work = os.environ.get('WORKDIR') or tempfile.mkdtemp()
os.chdir(work)
m = YOLOE('yoloe-11m-seg.pt')
m.set_classes(CLASSES, m.get_text_pe(CLASSES))
full = m.export(format='onnx', imgsz=640, simplify=True, opset=17, dynamic=False)
extract_model(full, 'det.onnx', ['images'], ['output0'])  # (1, 4 + classes + 32, 8400); mask coefficients unused
quantize_dynamic('det.onnx', 'det-int8.onnx', weight_type=QuantType.QUInt8)
shutil.copy('det-int8.onnx', OUT)
print('wrote', os.path.abspath(OUT), os.path.getsize(OUT) // 1e6, 'MB;', json.dumps(CLASSES))
