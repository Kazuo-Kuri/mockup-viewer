from flask import Flask, request, jsonify
from openai import OpenAI
from PIL import Image, ImageDraw
import io, base64, os

app = Flask(__name__)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

BG_PATH = "public/scenes/cafe.jpg"
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
        bag = _dataurl_to_img(request.json["bag_png_data_url"])
        bg  = Image.open(BG_PATH).convert("RGB")
        mask = _make_mask(bg.size, BOX)

        bgb = io.BytesIO(); bg.save(bgb, "PNG"); bgb.seek(0)
        msk = io.BytesIO(); mask.save(msk, "PNG"); msk.seek(0)
        bagb = io.BytesIO(); bag.save(bagb, "PNG"); bagb.seek(0)

        prompt = (
            "Place a flat-bottom coffee bag in the masked area. "
            "Match perspective and lighting to the cafe background. "
            "Keep the bag's label/colors; add realistic soft shadow."
        )

        res = client.images.edits(
            model="gpt-image-1",
            prompt=prompt,
            image=[bgb],
            mask=msk,
            additional_images=[bagb],  # SDKによっては引数名変更が必要
            size="1024x1024"
        )
        img = Image.open(io.BytesIO(base64.b64decode(res.data[0].b64_json)))
        return jsonify({"image_data_url": _img_to_dataurl(img)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)
