// src/Scene.jsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

// ★ 追加：書き出し側へ renderer/scene/camera を登録（堅牢にPNG化するため）
import { registerThreeRefs } from "./lib/export-bag";

const USE_GLTF_LIGHTS = true;
const USE_HDR_ENV = false;
const BASE = (typeof document !== "undefined" ? document.baseURI : "/");
const HDR_PATH = new URL("assets/hdr/studio_small.hdr", BASE).toString();

const TONE_EXPOSURE = 1.25;
const LIGHT_INTENSITY_BOOST = 2.2;
const AMBIENT_FLOOR = 0.18;

export default function Scene() {
  const mountRef = useRef(null);
  const threeRef = useRef({});
  const [artTexURL, setArtTexURL] = useState(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // --- renderer ---
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,          // ★ 追加：toDataURL時に消えない
    });
    renderer.domElement.id = "three-canvas"; // ★ 追加：書き出し側が確実に参照できる
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_EXPOSURE;
    if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
    renderer.setClearColor(0x000000, 0);     // ★ 追加：背景を完全透明に
    mount.appendChild(renderer.domElement);

    // --- scene / camera / controls ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.05, 50);
    camera.position.set(0.45, 0.25, 0.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 0.12, 0);

    // ★ 追加：書き出し用に参照を登録（export-bag がこれを使って確実に描画・取得します）
    registerThreeRefs(renderer, scene, camera);

    // ========= ここから：矢印キーでパン =========
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    const focusCanvas = () => canvas.focus();
    canvas.addEventListener("pointerdown", focusCanvas);

    const panByPixels = (dx, dy) => {
      const distance = camera.position.distanceTo(controls.target);
      const fovRad = (camera.fov * Math.PI) / 180;
      const viewHeight = 2 * Math.tan(fovRad / 2) * distance;
      const worldPerPixel = viewHeight / canvas.clientHeight;

      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      camera.matrix.extractBasis(xAxis, yAxis, zAxis);

      xAxis.multiplyScalar(dx * worldPerPixel);
      yAxis.multiplyScalar(-dy * worldPerPixel);

      const pan = new THREE.Vector3().add(xAxis).add(yAxis);
      camera.position.add(pan);
      controls.target.add(pan);
      controls.update();
    };

    const KEY_PAN = 60;
    const onKeyPan = (e) => {
      const k = e.code || e.key;
      switch (k) {
        case "ArrowUp":
        case "Up":    panByPixels(0, KEY_PAN); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowDown":
        case "Down":  panByPixels(0, -KEY_PAN); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowLeft":
        case "Left":  panByPixels(KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowRight":
        case "Right": panByPixels(-KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKeyPan, { capture: true });
    // ========= ここまで =========

    // --- environment (任意) ---
    let pmrem = null;
    if (USE_HDR_ENV) {
      pmrem = new THREE.PMREMGenerator(renderer);
      new RGBELoader().load(HDR_PATH, (hdr) => {
        const env = pmrem.fromEquirectangular(hdr).texture;
        scene.environment = env;
      });
    }

    // --- ground (影受け) ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- glTF 読み込み ---
    const bagGroup = new THREE.Group();
    scene.add(bagGroup);

    const loader = new GLTFLoader();
    const glbUrl = new URL(`assets/models/flatbottombag.glb?v=${Date.now()}`, BASE).toString();

    // …（以降のメッシュ/ライト/テクスチャ処理・あなたのコードはそのまま）…

    threeRef.current = { renderer, scene, camera, controls, bagGroup };

    // resize
    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // loop
    let raf;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", focusCanvas);
      window.removeEventListener("keydown", onKeyPan, { capture: true });
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      if (pmrem) pmrem.dispose();
    };
  }, [artTexURL]);

  // …（onFile/snapshot/JSX はそのまま）…
}
