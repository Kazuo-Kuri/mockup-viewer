import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const USE_GLTF_LIGHTS = true;
const USE_HDR_ENV    = false;
const BASE           = (typeof document !== "undefined" ? document.baseURI : "/");
const HDR_PATH       = new URL("assets/hdr/studio_small.hdr", BASE).toString();

const TONE_EXPOSURE        = 1.25;
const LIGHT_INTENSITY_BOOST= 2.2;
const AMBIENT_FLOOR        = 0.18;

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
    renderer.domElement.style.display = "block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_EXPOSURE;
    if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
    mount.appendChild(renderer.domElement);

    // --- scene / camera / controls ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.05,
      50
    );
    camera.position.set(0.45, 0.25, 0.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 0, 0);

    // ========= キー操作 =========
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

    // ========= ユーティリティ =========

    // PrintArea を除外してバウンディングボックスを作成
    function getBoxExcluding(root) {
      const box = new THREE.Box3();
      const tmp = new THREE.Box3();
      let hasAny = false;

      root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const isPrintArea = o.name === "PrintArea" || mats.some((m) => m?.name === "PrintArea");
        if (isPrintArea) return;

        o.updateWorldMatrix(true, false);
        tmp.setFromObject(o);
        if (!hasAny) {
          box.copy(tmp);
          hasAny = true;
        } else {
          box.union(tmp);
        }
      });

      if (!hasAny) box.setFromObject(root); // 念のためフォールバック
      return box;
    }

    // 渡された Box の中心が原点に来るよう root を再配置
    function recenterByBox(root, box) {
      const center = new THREE.Vector3();
      const size   = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      root.position.sub(center);         // 中心を (0,0,0) へ
      root.updateMatrixWorld(true);

      const newBox = new THREE.Box3().setFromObject(root); // 再計算
      return { box: newBox, size };
    }

    // ===== 投影オフセット適用（オフアクシス投影） =====
    function applyViewOffset(offset) {
      const { renderer, camera } = threeRef.current;
      if (!renderer || !camera) return;

      const el = renderer.domElement;
      const w = el.clientWidth  || el.width  || 1;
      const h = el.clientHeight || el.height || 1;

      const offX =  offset.x * 0.5 * w;   // x>0 で視窓を右へ → 物体が左寄りに見える
      const offY = -offset.y * 0.5 * h;   // y>0 で視窓を上へ → 物体が上寄りに見える

      if (offX !== 0 || offY !== 0) camera.setViewOffset(w, h, offX, offY, w, h);
      else                          camera.clearViewOffset();

      camera.updateProjectionMatrix();
    }

    // アスペクト対応でフレーミング + 画面寄せ（pivot=モデル中心のまま）
    function frameByBox(box, pad = 1.6, offset = { x: 0, y: 0 }) {
      const { camera, controls } = threeRef.current;

      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // 回転の支点は常にモデル中心
      controls.target.copy(center);

      // 画面に収めるための距離
      const halfV = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
      const distV = (size.y * 0.5) / Math.tan(halfV);
      const distH = (size.x * 0.5) / Math.tan(halfH);
      const distance = Math.max(distV, distH) * pad;

      // 視線方向を維持したまま距離だけ調整
      const dir = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .normalize();
      camera.position.copy(center).add(dir.multiplyScalar(distance));
      camera.lookAt(controls.target);
      camera.updateMatrixWorld(true);

      // ← カメラ位置は固定し、投影中心のみシフト
      applyViewOffset(offset);
      threeRef.current._viewOffset = offset; // リサイズ時に再適用

      camera.near = Math.max(0.01, distance / 100);
      camera.far  = Math.max(50, distance * 10);
      camera.updateProjectionMatrix();
      controls.update();
    }

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
          o.distance = 0; o.decay = 2;
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

    function shrinkwrapPrintArea(printMesh, targetRoot) {
      if (!printMesh) return;
      const targets = [];
      targetRoot.traverse((o) => {
        if (o.isMesh && o !== printMesh) targets.push(o);
      });
      if (!targets.length) return;

      const geom = printMesh.geometry;
      if (!geom || !geom.attributes?.position) return;

      geom.computeBoundingBox();
      printMesh.updateWorldMatrix(true, false);
      const printBoxWorld = geom.boundingBox.clone().applyMatrix4(printMesh.matrixWorld).expandByScalar(0.15);

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
            triList.push({ tri: new THREE.Triangle(a.clone(), b.clone(), c.clone()) });
          }
        }
      });
      if (!triList.length) return;

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
            t.getNormal(faceNormal);
            bestNormal = faceNormal.clone().normalize();
          }
        }

        if (bestPoint) {
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

    // ========= モデル読み込み =========
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

        // === PrintArea を除外した“実寸”で中心合わせ（原点=中心） ===
        const box0 = getBoxExcluding(root);
        const { box: centeredBox, size } = recenterByBox(root, box0);
        ground.position.y = -size.y * 0.5; // 地面を底面高さへ

        bagGroup.add(root);
        threeRef.current.mesh = root;

        const { printMesh, printMat } = pickPrintArea(root);
        threeRef.current.printMat = printMat;
        threeRef.current.printMesh = printMesh;

        // PrintArea を密着化
        tessellatePrintArea(printMesh, 2);
        shrinkwrapPrintArea(printMesh, root);

        // マテリアル安定設定
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

        // ★ PrintArea を除外した箱で「中央合わせ + 左上寄せ」（オフアクシス）
        frameByBox(centeredBox, 4.0, { x: 0.25, y: 0.4 });

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
        // フォールバック（単純な箱）
        addFallbackLights();
        const geo = new THREE.BoxGeometry(0.13, 0.195, 0.045, 2, 3, 1);
        const mat = new THREE.MeshPhysicalMaterial({ color: "#cccccc", metalness: 0.0, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;

        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3(); box.getSize(size);
        ground.position.y = -size.y * 0.5;

        bagGroup.add(mesh);
        threeRef.current.mesh = mesh;
        threeRef.current.printMat = null;
        threeRef.current.printMesh = null;

        // 同じく左上寄せ（オフアクシス）
        frameByBox(box, 4.0, { x: 0.25, y: 0.4 });
      }
    );

    threeRef.current = { renderer, scene, camera, controls, bagGroup };

    // === リサイズ（コンテナ基準 & ResizeObserverで追従） ===
    const resizeToMount = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // 画面寄せを再適用
      applyViewOffset(threeRef.current._viewOffset || { x: 0, y: 0 });
    };
    const ro = new ResizeObserver(resizeToMount);
    ro.observe(mount);
    window.addEventListener("resize", resizeToMount);

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
      ro.disconnect();
      window.removeEventListener("resize", resizeToMount);
      canvas.removeEventListener("pointerdown", focusCanvas);
      window.removeEventListener("keydown", onKeyPan, { capture: true });
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      if (pmrem) pmrem.dispose();
    };
  }, [artTexURL]);

  // ========= 画像差し替え & PNG出力 =========
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

  // ★ ペイン内にピッタリ張り付く
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, background: "#f8f9fb" }} />
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
