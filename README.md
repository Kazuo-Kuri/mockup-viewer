# My Bag Mockup — 2 Column Starter

## 起動
```bash
npm i
npm run dev
# 本番ビルド
npm run build   # dist/ を公開
```

## 使い方（最低限）
- `public/assets/models/stand_pouch.glb` を置く（無いときは仮形状）
- 袋の写真を `public/assets/textures/bag/baseColor.jpg` に置く（任意）
- 3D画面の右下コントロールから **PNG/JPG** をアップ（印刷データ）→ 3Dに即反映
- スライダーで **X/スケール/回転** を調整（印刷範囲を超えない設計）

## 仕様
- `public/spec/bag_stand_pouch.v3.json` を読み込み、印刷範囲 0.09×0.11m（上端オフセット0.04m）で制約
- 将来：HDRI を `/public/assets/hdr/` に置けば反射が良くなる
