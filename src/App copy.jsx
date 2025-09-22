// src/App.jsx
import React, { Suspense, lazy } from "react";

const Scene = lazy(() => import("./Scene.jsx"));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: String(err?.message ?? err) };
  }
  componentDidCatch(err, info) {
    console.error("[App] Scene load error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
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
  // ✅ 親（#root / .pane）のサイズにフィットさせる
  return (
    <div
      style={{
        width: "100%",     // ← 100vw ではなく 100%
        height: "100%",    // ← 100vh ではなく 100%
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
