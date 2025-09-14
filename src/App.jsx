// src/App.jsx
import React, { Suspense, lazy } from "react";

/**
 * three を含む Scene は遅延読み込み。
 * 初期ロードは React のみ → 体感を軽くし、バンドル警告も出づらくします。
 */
const Scene = lazy(() => import("./Scene.jsx"));

/** 簡易エラーバウンダリ（任意だが本番運用で安心） */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: String(err?.message ?? err) };
  }
  componentDidCatch(err, info) {
    // ここでログ送信なども可
    console.error("[App] Scene load error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100vw",
            height: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#fff",
            color: "#c00",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              3Dビューの読み込みに失敗しました
            </div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>
              {this.state.message}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // 画面いっぱいで Scene だけを表示（従来レイアウトを踏襲）
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <ErrorBoundary>
        <Suspense
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                color: "#333",
              }}
            >
              3D準備中…
            </div>
          }
        >
          <Scene />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
