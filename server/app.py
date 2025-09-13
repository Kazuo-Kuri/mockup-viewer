from flask import Flask, request, jsonify
from openai import OpenAI
from PIL import Image, ImageDraw
import io, base64, os

app = Flask(__name__)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BG_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "public", "scenes", "cafe.jpg"))
print("BG_PATH =>", BG_PATH)  # 起動時に確認用ログ
BOX = (600, 680, 940, 1080)  # 置き場所（後で調整）

def _dataurl_to_img(u):
    _, b64 = u.split(',', 1)
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")

def _img_to_dataurl(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

def _make_mask(size, box):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rectangle(box, fill=255)
    return m

@app.post("/compose_scene")
def compose_scene():
    try:
        data = request.get_json(force=True)
        if not data or "bag_png_data_url" not in data:
            return jsonify({"error": "bag_png_data_url がありません"}), 400
        if not os.path.exists(BG_PATH):
            return jsonify({"error": f"背景が見つかりません: {BG_PATH}"}), 500

        # 画像読み込み
        bag = _dataurl_to_img(data["bag_png_data_url"])   # RGBA
        bg  = Image.open(BG_PATH).convert("RGB")

        # 置き場所サイズにリサイズ
        x1, y1, x2, y2 = BOX
        w, h = x2 - x1, y2 - y1
        bag_resized = bag.resize((w, h), Image.LANCZOS)

        # そのまま貼り付け（アルファで）
        comp = bg.copy()
        comp.paste(bag_resized, (x1, y1), bag_resized)

        # dataURL で返す
        return jsonify({"image_data_url": _img_to_dataurl(comp)})

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
