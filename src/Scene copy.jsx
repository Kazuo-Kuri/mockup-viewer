import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const USE_GLTF_LIGHTS = true;                 // Blenderのライトを優先
const USE_HDR_ENV    = false;                 // 必要なら true にして反射/環境光を追加
// ▼ サブパス対応（ドキュメントの baseURI を基準に解決）
const BASE           = (typeof document !== "undefined" ? document.baseURI : "/");
const HDR_PATH       = new URL("assets/hdr/studio_small.hdr", BASE).toString();

const TONE_EXPOSURE        = 1.25;            // 全体の露出
const LIGHT_INTENSITY_BOOST= 2.2;             // glTFライトの見え強化
const AMBIENT_FLOOR        = 0.18;            // 真っ黒回避の微弱アンビ

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

    // ========= ここから：矢印キーでパン =========
    // キャンバスにフォーカスできるようにする（クリックで必ずフォーカス）
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    const focusCanvas = () => canvas.focus();
    canvas.addEventListener("pointerdown", focusCanvas);

    // ピクセル量 → ワールド量に変換して camera/target を平行移動
    const panByPixels = (dx, dy) => {
      // 可視高さから 1px が何ワールド単位か求める
      const distance = camera.position.distanceTo(controls.target);
      const fovRad = (camera.fov * Math.PI) / 180;
      const viewHeight = 2 * Math.tan(fovRad / 2) * distance;
      const worldPerPixel = viewHeight / canvas.clientHeight;

      // カメラの右(X)、上(Y)ベクトル
      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      camera.matrix.extractBasis(xAxis, yAxis, zAxis);

      // 右(+X)へ dx、上(+Y)へ dy だが、画面座標は上が - なので符号調整
      xAxis.multiplyScalar(dx * worldPerPixel);
      yAxis.multiplyScalar(-dy * worldPerPixel);

      const pan = new THREE.Vector3().add(xAxis).add(yAxis);

      camera.position.add(pan);
      controls.target.add(pan);
      controls.update();
    };

    const KEY_PAN = 60; // 移動量（ピクセル相当）

    const onKeyPan = (e) => {
      const k = e.code || e.key;
      switch (k) {
        case "ArrowUp":
        case "Up":
          panByPixels(0, KEY_PAN); e.preventDefault(); e.stopPropagation(); break;   // ↑ 上へ
        case "ArrowDown":
        case "Down":
          panByPixels(0, -KEY_PAN); e.preventDefault(); e.stopPropagation(); break;  // ↓ 下へ
        case "ArrowLeft":
        case "Left":
          panByPixels(KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;   // ← 左へ
        case "ArrowRight":
        case "Right":
          panByPixels(-KEY_PAN, 0); e.preventDefault(); e.stopPropagation(); break;  // → 右へ
        default:
          return;
      }
    };

    // 入力欄にフォーカスがあっても確実に受け取れるよう window/capture に登録
    window.addEventListener("keydown", onKeyPan, { capture: true });
    // ========= ここまで =========

    // --- environment (任意) ---
    let pmrem = null;
    if (USE_HDR_ENV) {
      pmrem = new THREE.PMREMGenerator(renderer);
      new RGBELoader().load(HDR_PATH, (hdr) => {
        const env = pmrem.fromEquirectangular(hdr).texture;
        scene.environment = env;
        // scene.background = env; // 必要なら背景もHDRに
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
    // ▼ サブパス対応（BASE 基準で glb を解決）
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

      // 微弱アンビを常設（真っ黒回避）
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
        // three だと glTF より暗く見えやすいので少し増幅
        if (typeof o.intensity === "number") o.intensity *= LIGHT_INTENSITY_BOOST;

        if (o.isPointLight || o.isSpotLight) {
          o.distance = 0; // 無限到達で減衰だけ効かせる
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

    // --- UV変換を新テクスチャへ引き継ぐ（UVフィットのみの処理） ---
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

    // === 追加：PrintArea を袋表面へ“密着”させる（最近傍三角形への投影） ===
    function shrinkwrapPrintArea(printMesh, targetRoot) {
      if (!printMesh) return;

      // 投影先（PrintArea 自身は除外）
      const targets = [];
      targetRoot.traverse((o) => {
        if (o.isMesh && o !== printMesh) targets.push(o);
      });
      if (!targets.length) return;

      const geom = printMesh.geometry;
      if (!geom || !geom.attributes?.position) return;

      // PrintArea のワールドAABBを作り、周囲に少し余裕を持たせる
      geom.computeBoundingBox();
      printMesh.updateWorldMatrix(true, false);
      const printBoxWorld = geom.boundingBox.clone().applyMatrix4(printMesh.matrixWorld).expandByScalar(0.15);

      // 近傍三角形のリストをワールド座標で作成（AABBが重なるものだけ）
      const triList = [];
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const tri = new THREE.Triangle(a, b, c);
      const triBox = new THREE.Box3();

      targets.forEach((obj) => {
        const g = obj.geometry;
        if (!g || !g.attributes?.position) return;

        obj.updateWorldMatrix(true, false);
        const mw = obj.matrixWorld;

        const pos = g.attributes.position;
        const hasIndex = !!g.index;
        const idx = hasIndex ? g.index.array : null;

        const triCount = hasIndex ? idx.length / 3 : pos.count / 3;
        for (let i = 0; i < triCount; i++) {
          const i0 = hasIndex ? idx[i * 3 + 0] : i * 3 + 0;
          const i1 = hasIndex ? idx[i * 3 + 1] : i * 3 + 1;
          const i2 = hasIndex ? idx[i * 3 + 2] : i * 3 + 2;

          a.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(mw);
          b.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(mw);
          c.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(mw);

          triBox.setFromPoints([a, b, c]);
          if (triBox.intersectsBox(printBoxWorld)) {
            triList.push({
              tri: new THREE.Triangle(a.clone(), b.clone(), c.clone()),
            });
          }
        }
      });
      if (!triList.length) return;

      // 各頂点を最近傍三角形の最近傍点へ移動
      const pos = geom.attributes.position;
      const worldToLocal = new THREE.Matrix4().copy(printMesh.matrixWorld).invert();
      const vWorld = new THREE.Vector3();
      const closest = new THREE.Vector3();
      const faceNormal = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        vWorld.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(printMesh.matrixWorld);

        let minD2 = Infinity;
        let bestPoint = null;
        let bestNormal = null;

        for (let j = 0; j < triList.length; j++) {
          const t = triList[j].tri;
          t.closestPointToPoint(vWorld, closest);
          const d2 = vWorld.distanceToSquared(closest);
          if (d2 < minD2) {
            minD2 = d2;
            bestPoint = closest.clone();
            // 三角形法線（ワールド）
            t.getNormal(faceNormal);
            bestNormal = faceNormal.clone().normalize();
          }
        }

        if (bestPoint) {
          // ほんの少し外側へ（Z-fighting回避）
          bestPoint.addScaledVector(bestNormal, 0.0005);
          bestPoint.applyMatrix4(worldToLocal);
          pos.setXYZ(i, bestPoint.x, bestPoint.y, bestPoint.z);
        }
      }

      pos.needsUpdate = true;
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
    }
    // === 追加ここまで ===

    // === 追加：低ポリ PrintArea を細分化して密着度を上げる（4分割×n回） ===
    function tessellatePrintArea(mesh, iterations = 2) {
      if (!mesh || !mesh.geometry) return;

      const gCheck = mesh.geometry;
      const triCount = (gCheck.index ? gCheck.index.count : gCheck.attributes.position.count) / 3;
      if (triCount > 2000) return;

      let geom = mesh.geometry;
      for (let it = 0; it < iterations; it++) {
        const src = geom.toNonIndexed();
        const pos = src.getAttribute("position");
        const uv  = src.getAttribute("uv");

        const newPos = [];
        const newUV  = [];

        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const ab = new THREE.Vector3(), bc = new THREE.Vector3(), ca = new THREE.Vector3();

        const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
        const uab = new THREE.Vector2(), ubc = new THREE.Vector2(), uca = new THREE.Vector2();

        for (let i = 0; i < pos.count; i += 3) {
          a.fromBufferAttribute(pos, i + 0);
          b.fromBufferAttribute(pos, i + 1);
          c.fromBufferAttribute(pos, i + 2);

          ab.addVectors(a, b).multiplyScalar(0.5);
          bc.addVectors(b, c).multiplyScalar(0.5);
          ca.addVectors(c, a).multiplyScalar(0.5);

          newPos.push(
            a.x, a.y, a.z,  ab.x, ab.y, ab.z,  ca.x, ca.y, ca.z,
            ab.x, ab.y, ab.z,  b.x, b.y, b.z,  bc.x, bc.y, bc.z,
            ca.x, ca.y, ca.z,  bc.x, bc.y, bc.z,  c.x, c.y, c.z,
            ab.x, ab.y, ab.z,  bc.x, bc.y, bc.z,  ca.x, ca.y, ca.z
          );

          if (uv) {
            ua.fromBufferAttribute(uv, i + 0);
            ub.fromBufferAttribute(uv, i + 1);
            uc.fromBufferAttribute(uv, i + 2);

            uab.addVectors(ua, ub).multiplyScalar(0.5);
            ubc.addVectors(ub, uc).multiplyScalar(0.5);
            uca.addVectors(uc, ua).multiplyScalar(0.5);

            newUV.push(
              ua.x, ua.y,  uab.x, uab.y,  uca.x, uca.y,
              uab.x, uab.y,  ub.x, ub.y,  ubc.x, ubc.y,
              uca.x, uca.y,  ubc.x, ubc.y,  uc.x, uc.y,
              uab.x, uab.y,  ubc.x, ubc.y,  uca.x, uca.y
            );
          }
        }

        const gNext = new THREE.BufferGeometry();
        gNext.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
        if (newUV.length) gNext.setAttribute("uv", new THREE.Float32BufferAttribute(newUV, 2));
        gNext.computeVertexNormals();
        gNext.computeBoundingBox();
        gNext.computeBoundingSphere();

        geom.dispose();
        geom = gNext;
      }

      mesh.geometry = geom;
    }
    // === 追加ここまで ===

    loader.load(
      glbUrl,
      (gltf) => {
        const root = gltf.scene;

        // ライト
        const hasLights = USE_GLTF_LIGHTS ? enableGltfLights(root) : false;
        if (!hasLights) addFallbackLights();

        // メッシュとマテリアルの最小限の調整（置換はしない）
        root.traverse((o) => {
          if (!o.isMesh) return;

          o.castShadow = true;
          o.receiveShadow = true;

          // 頂点カラーが乗って黒くなるモデルへの対策（必要時のみ）
          if (o.geometry?.attributes?.color) {
            o.geometry.deleteAttribute?.("color");
          }

          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            if ("roughness" in m) m.roughness = Math.min(0.95, Math.max(0.25, m.roughness ?? 0.6));
            if ("metalness" in m && !("metalnessMap" in m)) {
              m.metalness = Math.min(0.5, Math.max(0.0, m.metalness ?? 0.0));
            }
            if ("envMapIntensity" in m) m.envMapIntensity = USE_HDR_ENV ? 1.0 : 0.5;
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;

            m.side = THREE.FrontSide;
            m.toneMapped = true;
            m.needsUpdate = true;
          });
        });

        bagGroup.add(root);

        // PrintArea の参照を保持（画像差し替え用）
        const { printMesh, printMat } = pickPrintArea(root);
        threeRef.current.mesh = root;
        threeRef.current.printMat = printMat;
        threeRef.current.printMesh = printMesh;

        // 追加：PrintArea を細分化してから袋表面へ密着
        tessellatePrintArea(printMesh, 2);
        shrinkwrapPrintArea(printMesh, root);

        if (printMat) {
          // 安定描画
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

        // すでにユーザー画像が選択されていれば適用（UV/transform 引き継ぎ）
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
      },
      undefined,
      () => {
        // GLB 読み込み失敗時も暗転しないフォールバック
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

  // 画像アップロード（PrintArea差し替え：UV/トランスフォームを引き継ぐ）
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

  // 高解像度PNGを書き出す（表示はそのまま）
  function snapshot(scale = 2, bgColor = "#ffffff") {
    const { renderer, scene, camera } = threeRef.current;
    if (!renderer || !scene || !camera) return;

    // 出力サイズ（表示キャンバス基準）
    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width  = Math.max(2, Math.floor(cw * dpr * scale));
    const height = Math.max(2, Math.floor(ch * dpr * scale));

    // 書き出し専用レンダラ（読み出し保証）
    const exp = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    exp.setSize(width, height, false);
    exp.outputColorSpace    = renderer.outputColorSpace;
    exp.toneMapping         = renderer.toneMapping;
    exp.toneMappingExposure = renderer.toneMappingExposure;
    exp.shadowMap.enabled   = renderer.shadowMap.enabled;
    exp.shadowMap.type      = renderer.shadowMap.type;

    // 背景色（透過にしたいなら bgColor を null で呼ぶ）
    if (bgColor == null) exp.setClearColor(0x000000, 0);
    else                 exp.setClearColor(bgColor, 1);

    // カメラを複製してアスペクトを合わせる（表示側に影響させない）
    const cam = camera.clone();
    cam.aspect = width / height;
    cam.updateProjectionMatrix();

    // 1フレーム描画 → Blob で保存
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
