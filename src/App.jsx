import React from "react";
import Scene from "./Scene.jsx";

export default function App() {
  // 画面いっぱいで Scene だけを表示
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      margin: 0,
      padding: 0,
      overflow: "hidden",
      background: "#fff"
    }}>
      <Scene />
    </div>
  );
}
