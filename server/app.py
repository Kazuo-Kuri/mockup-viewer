# server/app.py
import os
import io
import base64
from typing import Tuple, Optional

from flask import Flask, request, jsonify, make_response
from PIL import Image, ImageDraw
import requests

app = Flask(__name__)

# ====== 設定 ======
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 既存パスを尊重（public/scenes/cafe.jpg）。無ければあとでURLで指定可。
BG_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "public", "scenes", "cafe.jpg"))
print("BG_PATH =>", BG_PATH)

# 置き場所（x1, y1, x2, y2） 既存値を踏襲。必要に応じて調整してください。
BOX: Tuple[int, int, int, int] = (600, 680, 940, 1080)

# CORS 許可（本番: https://mockup-viewer.onrender.com を指定推奨）
ALLOW_ORIGIN = os.getenv("ALLOWED_ORIGIN", "*")


# ====== ヘルパ ======
def _dataurl_to_img(u: str) -> Image.Image:
    if not isinstance(u, str) or not u.startswith("data:"):
        raise ValueError("image は dataURL 文字列で渡してください。")
    _, b64 = u.split(",", 1)
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


def _img_to_dataurl(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _make_mask(size: Tuple[int, int], box: Tuple[int, int, int, int]) -> Image.Image:
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rectangle(box, fill=255)
    return m


def _load_background(local_path: str, url_override: Optional[str] = None) -> Image.Image:
    """
    背景取得：URLが指定されていれば取得。なければローカル(BG_PATH)。
    """
    if url_override and url_override.startswith(("http://", "https://")):
        r = requests.get(url_override, timeout=10)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")

    if not os.path.exists(local_path):
        raise FileNotFoundError(f"背景が見つかりません: {local_path}")

    return Image.open(local_path).convert("RGB")


# ====== CORS & Health ======
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = ALLOW_ORIGIN
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.get("/healthz")
def healthz():
    return "ok", 200, {"Content-Type": "text/plain; charset=utf-8"}


# ====== メイン API ======
@app.route("/compose", methods=["POST", "OPTIONS"])
def compose():
    # Preflight
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        # 互換: 以前の名前 bag_png_data_url も受け付ける
        body = request.get_json(silent=True) or {}
        dataurl = body.get("image") or body.get("bag_png_data_url")
        bg_url = body.get("background")  # 任意: 背景をURLで上書き

        if not dataurl:
            return jsonify({"error": "image(dataURL) または bag_png_data_url が必須です。"}), 400

        # 入力画像・背景読み込み
        bag = _dataurl_to_img(dataurl)                 # RGBA
        bg = _load_background(BG_PATH, bg_url)         # RGB

        # 貼り付け用リサイズ
        x1, y1, x2, y2 = BOX
        w, h = max(1, x2 - x1), max(1, y2 - y1)
        bag_resized = bag.resize((w, h), Image.LANCZOS)

        # 合成
        comp = bg.copy()
        comp.paste(bag_resized, (x1, y1), bag_resized)  # アルファで合成

        # 返却形式の切り替え: ?format=json なら dataURL JSON
        if (request.args.get("format") or "").lower() == "json":
            return jsonify({"image_data_url": _img_to_dataurl(comp)})

        # デフォルトは image/png バイナリ
        buf = io.BytesIO()
        comp.save(buf, format="PNG")
        buf.seek(0)
        resp = make_response(buf.read())
        resp.headers["Content-Type"] = "image/png"
        return resp

    except Exception as e:
        app.logger.exception("compose failed")
        return jsonify({"error": "compose failed", "message": str(e)}), 500


# ====== 404 ======
@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not found"}), 404


if __name__ == "__main__":
    # ローカル実行用
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")), debug=True)
