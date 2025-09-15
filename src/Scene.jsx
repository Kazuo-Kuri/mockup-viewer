import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const USE_GLTF_LIGHTS = true;
const USE_HDR_ENV    = false;
const BASE           = (typeof document !== "undefined" ? document.baseURI : "/");
const HDR_PATH       = new URL("assets/hdr/studio_small.hdr", BASE).toString();

const TONE_EXPOSURE         = 1.25;
const LIGHT_INTENSITY_BOOST = 2.2;
const AMBIENT_FLOOR         = 0.18;

export default function Scene() {
  const mountRef = useRef(null);
  const threeRef = useRef({});
  const [artTexURL, setArtTexURL] = useState(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // --- renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.domElement.id = "three-canvas";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_EXPOSURE;
    if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
    mount.appendChild(renderer.domElement);

    // --- scene / camera / controls ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.05, 50);
    camera.position.set(0.45, 0.25, 0.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 0.12, 0);

    // ===== 初回だけ視野内にぴったり入れる関数 =====
    function fitToView(object, camera, controls) {
      const box = new THREE.Box3().setFromObject(object);
      if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;

      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // 視点の向きは維持しつつ距離だけ調整
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov    = (camera.fov * Math.PI) / 180;
      let dist     = (maxDim / 2) / Math.tan(fov / 2);
      dist *= 1.4; // 少しマージン

      controls.target.copy(center);

      const dir = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .normalize();
      camera.position.copy(center).addScaledVector(dir, dist);

      camera.near = Math.max(0.01, dist / 100);
      camera.far  = dist * 100;
      camera.updateProjectionMatrix();
      controls.update();
    }
    // ======================================

    // ========= キー操作パン =========
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
        case "Up":    panByPixels(0,  KEY_PAN); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowDown":
        case "Down":  panByPixels(0, -KEY_PAN); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowLeft":
        case "Left":  panByPixels( KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowRight":
        case "Right": panByPixels(-KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKeyPan, { capture: true });
    // ================================

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

    const pickPrintArea = (root) => {
      let printMesh = null;
      let printMat = null;
      root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m && m.name === "PrintArea") {
            printMesh = o;
            printMat = m;
          }
        });
      });
      return { printMesh, printMat };
    };

    const enableGltfLights = (root) => {
      let found = false;
      scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_FLOOR));
      root.traverse((o) => {
        if (!o.isLight) return;
        found = true;
        o.castShadow = true;
        if (o.shadow?.mapSize) {
          o.shadow.mapSize.set(1024, 1024);
          o.shadow.bias = -0.0002;
          o.shadow.normalBias = 0.02;
        }
        if (typeof o.intensity === "number") o.intensity *= LIGHT_INTENSITY_BOOST;
        if (o.isPointLight || o.isSpotLight) {
          o.distance = 0;
          o.decay = 2;
          if (o.isSpotLight) o.penumbra = Math.min(0.6, o.penumbra ?? 0.3);
        }
      });
      return found;
    };

    const addFallbackLights = () => {
      const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
      const dir  = new THREE.DirectionalLight(0xffffff, 1.25);
      dir.position.set(0.7, 1.2, 0.8);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.bias = -0.0005;
      scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_FLOOR), hemi, dir);
    };

    function copyTextureTransform(fromTex, toTex) {
      if (!fromTex || !toTex) return;
      toTex.wrapS = fromTex.wrapS;
      toTex.wrapT = fromTex.wrapT;
      toTex.offset.copy(fromTex.offset);
      toTex.repeat.copy(fromTex.repeat);
      (toTex.center ?? (toTex.center = new THREE.Vector2())).copy(fromTex.center ?? new THREE.Vector2(0.5, 0.5));
      toTex.rotation = fromTex.rotation ?? 0;
      toTex.matrixAutoUpdate = fromTex.matrixAutoUpdate ?? true;
      if (fromTex.userData?.KHR_texture_transform) {
        toTex.userData = toTex.userData || {};
        toTex.userData.KHR_texture_transform = { ...fromTex.userData.KHR_texture_transform };
      }
      toTex.needsUpdate = true;
    }

    // === shrinkwrap / tessellate（そのまま） ===
    function shrinkwrapPrintArea(printMesh, targetRoot) { /* 省略なし：元コードのまま */ }
    function tessellatePrintArea(mesh, iterations = 2) { /* 省略なし：元コードのまま */ }
    // ↑※実装はあなたの元コードをそのまま置いてください（長文になるので説明上省略しています）

    loader.load(
      glbUrl,
      (gltf) => {
        const root = gltf.scene;

        const hasLights = USE_GLTF_LIGHTS ? enableGltfLights(root) : false;
        if (!hasLights) addFallbackLights();

        root.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.geometry?.attributes?.color) o.geometry.deleteAttribute?.("color");
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            if ("roughness" in m) m.roughness = Math.min(0.95, Math.max(0.25, m.roughness ?? 0.6));
            if ("metalness" in m && !("metalnessMap" in m)) m.metalness = Math.min(0.5, Math.max(0.0, m.metalness ?? 0.0));
            if ("envMapIntensity" in m) m.envMapIntensity = USE_HDR_ENV ? 1.0 : 0.5;
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            m.side = THREE.FrontSide;
            m.toneMapped = true;
            m.needsUpdate = true;
          });
        });

        bagGroup.add(root);

        // ★ ここで一度だけ画面にフィット
        fitToView(root, camera, controls);

        const { printMesh, printMat } = pickPrintArea(root);
        threeRef.current.mesh = root;
        threeRef.current.printMat = printMat;
        threeRef.current.printMesh = printMesh;

        tessellatePrintArea(printMesh, 2);
        shrinkwrapPrintArea(printMesh, root);

        if (printMat) {
          printMat.transparent = false;
          printMat.alphaTest = 0.01;
          printMat.depthTest = true;
          printMat.depthWrite = true;
          printMat.polygonOffset = true;
          printMat.polygonOffsetFactor = -1;
          printMat.polygonOffsetUnits = -1;
          printMat.needsUpdate = true;
        }
        if (printMesh) {
          printMesh.renderOrder = 10;
          printMesh.frustumCulled = false;
        }

        if (artTexURL && printMat) {
          const oldTex = printMat.map || null;
          new THREE.TextureLoader().load(artTexURL, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            tex.anisotropy = 8;
            if (oldTex) copyTextureTransform(oldTex, tex);
            else tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            printMat.map = tex;
            printMat.needsUpdate = true;
          });
        }

        // レイアウト確定後のサイズ再取得（環境によってはこれだけで直ることも）
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      },
      undefined,
      () => {
        // 読み込み失敗でも何かは表示 & フィット
        addFallbackLights();
        const geo = new THREE.BoxGeometry(0.13, 0.195, 0.045, 2, 3, 1);
        const mat = new THREE.MeshPhysicalMaterial({ color: "#cccccc", metalness: 0.0, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.position.y = 0.195 / 2;
        bagGroup.add(mesh);
        threeRef.current.mesh = mesh;
        threeRef.current.printMat = null;
        threeRef.current.printMesh = null;

        // ★ フォールバック時もフィット
        fitToView(mesh, camera, controls);
      }
    );

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

  // 画像アップロード
  function onFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setArtTexURL(url);

    const { printMat } = threeRef.current;
    if (!printMat) return;

    const oldTex = printMat.map || null;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = 8;
      if (oldTex) {
        tex.wrapS = oldTex.wrapS;
        tex.wrapT = oldTex.wrapT;
        tex.offset.copy(oldTex.offset);
        tex.repeat.copy(oldTex.repeat);
        (tex.center ?? (tex.center = new THREE.Vector2())).copy(oldTex.center ?? new THREE.Vector2(0.5, 0.5));
        tex.rotation = oldTex.rotation ?? 0;
        tex.matrixAutoUpdate = oldTex.matrixAutoUpdate ?? true;
        if (oldTex.userData?.KHR_texture_transform) {
          tex.userData = tex.userData || {};
          tex.userData.KHR_texture_transform = { ...oldTex.userData.KHR_texture_transform };
        }
      } else {
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      printMat.map = tex;
      printMat.transparent = false;
      printMat.alphaTest = 0.01;
      printMat.depthTest = true;
      printMat.depthWrite = true;
      printMat.polygonOffset = true;
      printMat.polygonOffsetFactor = -1;
      printMat.polygonOffsetUnits = -1;
      printMat.needsUpdate = true;
    });
  }

  // 高解像度PNG書き出し
  function snapshot(scale = 2, bgColor = "#ffffff") {
    const { renderer, scene, camera } = threeRef.current;
    if (!renderer || !scene || !camera) return;
    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width  = Math.max(2, Math.floor(cw * dpr * scale));
    const height = Math.max(2, Math.floor(ch * dpr * scale));

    const exp = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    exp.setSize(width, height, false);
    exp.outputColorSpace    = renderer.outputColorSpace;
    exp.toneMapping         = renderer.toneMapping;
    exp.toneMappingExposure = renderer.toneMappingExposure;
    exp.shadowMap.enabled   = renderer.shadowMap.enabled;
    exp.shadowMap.type      = renderer.shadowMap.type;

    if (bgColor == null) exp.setClearColor(0x000000, 0);
    else                 exp.setClearColor(bgColor, 1);

    const cam = camera.clone();
    cam.aspect = width / height;
    cam.updateProjectionMatrix();

    exp.render(scene, cam);
    exp.domElement.toBlob((blob) => {
      if (!blob) { exp.dispose(); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mockup.png";
      a.click();
      URL.revokeObjectURL(url);
      exp.dispose();
    }, "image/png");
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "80vh", background: "#f8f9fb" }} />
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          background: "rgba(255,255,255,0.9)",
          borderRadius: 12,
          boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          padding: 12,
          display: "flex",
          gap: 12,
          alignItems: "center"
        }}
      >
        <div>
          <label style={{ fontSize: 12, display: "block" }}>アート画像</label>
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <button
          onClick={() => snapshot()}
          style={{ padding: "6px 12px", border: "1px solid #ccc", borderRadius: 6 }}
        >
          PNG書き出し
        </button>
      </div>
    </div>
  );
}
