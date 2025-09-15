(() => {
  'use strict';

  // =========================
  // Config & Scene Setup
  // =========================
  const stage = document.getElementById('stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f8fb);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(10, 22, 36);
  camera.lookAt(0, -6, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  // Color/Tone
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Ombre morbide
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // Luci
  scene.add(new THREE.HemisphereLight(0x8fb5ff, 0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(12, 24, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xfff1d6, 0.25);
  fill.position.set(-14, 8, -12);
  scene.add(fill);

  // Terreno per ombre
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -18;
  ground.receiveShadow = true;
  scene.add(ground);

  // Resize
  function onResize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', onResize, { passive: true });
  onResize();

  // =========================
  // Geometry / Materials (sticker look)
  // =========================
  const LAYERS = [5, 4, 3, 2, 1];          // 5×5 -> 1×1
  const CUBE = { size: 2.0, gap: 0.22 };   // gap = bordo
  const PITCH = CUBE.size + CUBE.gap;

  const GEO_BODY = new THREE.BoxGeometry(CUBE.size + CUBE.gap, CUBE.size + CUBE.gap, CUBE.size + CUBE.gap);
  const GEO_FRAME = new THREE.EdgesGeometry(GEO_BODY);
  const GEO_STICKER = new THREE.PlaneGeometry(CUBE.size, CUBE.size);

  const MAT_BODY = new THREE.MeshPhysicalMaterial({
    color: 0x11141b, roughness: 0.9, metalness: 0.0, clearcoat: 0.2, clearcoatRoughness: 0.9
  });
  const MAT_FRAME = new THREE.LineBasicMaterial({ color: 0x000000 });

  // Canvas numero ad alta risoluzione (con angoli arrotondati)
  function makeNumberTexture(num, borderHex = '#0a0e15') {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = 64;

    // sfondo bianco
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(S, 0, S, S, r);
    g.arcTo(S, S, 0, S, r); g.arcTo(0, S, 0, 0, r); g.arcTo(0, 0, S, 0, r);
    g.closePath(); g.fill();

    // bordo
    g.strokeStyle = borderHex;
    g.lineWidth = 16;
    g.stroke();

    // numero (vuoto se 0)
    if (num && num !== '') {
      g.fillStyle = '#11161f';
      g.font = 'bold 280px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(num), S / 2, S / 2 + 6);
    }

    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = 8;
    tx.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
    return tx;
  }

  function buildCube(number) {
    const g = new THREE.Group();

    const body = new THREE.Mesh(GEO_BODY, MAT_BODY);
    body.castShadow = true;
    g.add(body);

    const edges = new THREE.LineSegments(GEO_FRAME, MAT_FRAME);
    edges.renderOrder = 2;
    g.add(edges);

    const faces = [];
    const mats = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: makeNumberTexture(number), transparent: true });
      mats.push(mat);
      const m = new THREE.Mesh(GEO_STICKER, mat);
      faces.push(m);
      g.add(m);
    }

    // posiziona sticker leggermente sporgenti
    const s = (CUBE.size + CUBE.gap) / 2 + 0.001;
    faces[0].position.set( s, 0, 0); faces[0].rotation.y = -Math.PI/2; // +X
    faces[1].position.set(-s, 0, 0); faces[1].rotation.y =  Math.PI/2; // -X
    faces[2].position.set(0,  s, 0); faces[2].rotation.x =  Math.PI/2; // +Y
    faces[3].position.set(0, -s, 0); faces[3].rotation.x = -Math.PI/2; // -Y
    faces[4].position.set(0, 0,  s);                                   // +Z (front)
    faces[5].position.set(0, 0, -s); faces[5].rotation.y = Math.PI;    // -Z (back)

    g.userData = { number, body, faces, mats };
    return g;
  }

  // =========================
  // Build Pyramid (extruded)
  // =========================
  const cubes = []; // {mesh, layer, i, j, value}

  function centerFor(layerIdx, i, j) {
    const N = LAYERS[layerIdx];
    const x = (i - (N - 1) / 2) * PITCH;
    const z = (j - (N - 1) / 2) * PITCH;
    const y = -layerIdx * PITCH;
    return new THREE.Vector3(x, y, z);
  }

  function buildPyramid() {
    // pulizia
    cubes.forEach(c => scene.remove(c.mesh));
    cubes.length = 0;

    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const cube = buildCube('');         // inizialmente vuoti
          cube.position.copy(centerFor(l, i, j));
          scene.add(cube);
          cubes.push({ mesh: cube, layer: l, i, j, value: 0 });
        }
      }
    }
  }

  // Helper per trovare un cubo
  function getCube(layer, i, j) {
    return cubes.find(c => c.layer === layer && c.i === i && c.j === j);
  }

  // Aggiorna tutte le facce con un numero
  function setCubeValue(c, v, border = '#0a0e15') {
    c.value = v;
    c.mesh.userData.number = v;
    c.mesh.userData.mats.forEach(m => {
      m.map = makeNumberTexture(v ? v : '', border);
      m.needsUpdate = true;
    });
  }

  // =========================
  // Logica “Piramide Matematica”
  // =========================
  // Regola: inserisci 5 numeri (1..15) sulla FILA FRONTALE del layer 0 (quella con j=0).
  // Ogni layer successivo è la differenza assoluta tra coppie adiacenti del layer precedente.
  // La differenza è “estrusa” su tutta la profondità del layer (tutti i j condividono lo stesso valore).
  // Obiettivo: i 15 numeri (5 top + 10 differenze) devono essere tutti 1..15 e TUTTI DIVERSI.

  // Valori correnti calcolati (per comodità)
  let topRow = [0, 0, 0, 0, 0]; // i = 0..4 (j=0), layer 0
  let allValues = [];           // 5 + 10 differenze

  // Calcola differenze & riempie la piramide in base a topRow
  function propagateAndPaint() {
    // 1) Pulisci tutto
    cubes.forEach(c => setCubeValue(c, 0));

    // 2) layer 0, j=0 (fila frontale), i: prendi topRow
    for (let i = 0; i < 5; i++) {
      const c = getCube(0, i, 0);
      setCubeValue(c, topRow[i]);
    }
    // estrudi il valore della riga frontale a TUTTA la profondità del layer 0
    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5; j++) {
        const v = topRow[i];
        const c = getCube(0, i, j);
        setCubeValue(c, v);
      }
    }

    // 3) differenze layer 1..4
    // arrL conterrà i valori della "fila frontale" di ogni layer, poi estrusi
    let prev = [...topRow]; // 5
    const diffLayers = [];  // [4], [3], [2], [1]
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      const cur = [];
      for (let i = 0; i < N; i++) {
        // diff tra prev[i] e prev[i+1]
        const a = prev[i];
        const b = prev[i + 1];
        const d = (a && b) ? Math.abs(a - b) : 0;
        cur.push(d);
      }
      diffLayers.push(cur);
      prev = cur;
    }

    // 4) colloca differenze su tutti i cubi del rispettivo layer (estrusione su j)
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          setCubeValue(getCube(l, i, j), diffLayers[l - 1][i]);
        }
      }
    }

    // 5) aggiorna array totale dei 15 numeri (5 top + 10 differenze)
    allValues = [...topRow, ...diffLayers.flat()];

    // 6) evidenzia errori e aggiorna status
    recomputeErrors();
  }

  function recomputeErrors() {
    // Reset bordi a default
    cubes.forEach(c => setCubeValue(c, c.value, '#0a0e15'));

    // Regole: NO 0, NO >15, duplicati (sull’insieme dei 15 valori logici)
    const seen = new Map(); // val -> {count, where:[{layer,i}]}
    allValues.forEach((v, k) => {
      if (!v) return; // 0 lo segniamo dopo
      if (!seen.has(v)) seen.set(v, { count: 0, where: [] });
      const slotInfo = indexToLayerIndex(k);
      seen.get(v).count++;
      seen.get(v).where.push(slotInfo);
    });

    // valori non validi (0 o >15)
    const invalidIdx = new Set();
    allValues.forEach((v, k) => {
      if (v < 1 || v > 15) invalidIdx.add(k);
    });

    // duplicati
    const duplicatesIdx = new Set();
    for (const [val, info] of seen.entries()) {
      if (info.count > 1) {
        info.where.forEach(w => duplicatesIdx.add(layerIndexToIndex(w.layer, w.i)));
      }
    }

    // Applica highlight su TUTTI i cubi di quel layer/colonna (estrusione su j)
    const colorErr = '#ff3b30'; // rosso iOS
    // invalidi
    invalidIdx.forEach(k => {
      const w = indexToLayerIndex(k);
      paintColumnAsError(w.layer, w.i, colorErr);
    });
    // duplicati
    duplicatesIdx.forEach(k => {
      const w = indexToLayerIndex(k);
      paintColumnAsError(w.layer, w.i, colorErr);
    });

    // Status: quante differenze (4+3+2+1=10) within 1..15 e uniche?
    const diffsOnly = allValues.slice(5); // 10
    const okDiffs = diffsOnly.filter(v => v >= 1 && v <= 15);
    const uniqueCount = new Set(diffsOnly.filter(v => v >= 1 && v <= 15)).size;
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerHTML = `Differenze uniche: <b>${uniqueCount}/10</b>`;
  }

  // Mappa: indice “logico” dei 15 numeri -> {layer, i}
  // 0..4   -> layer 0, i=0..4
  // 5..8   -> layer 1, i=0..3
  // 9..11  -> layer 2, i=0..2
  // 12..13 -> layer 3, i=0..1
  // 14     -> layer 4, i=0
  function indexToLayerIndex(k) {
    if (k <= 4) return { layer: 0, i: k };
    if (k <= 8) return { layer: 1, i: k - 5 };
    if (k <= 11) return { layer: 2, i: k - 9 };
    if (k <= 13) return { layer: 3, i: k - 12 };
    return { layer: 4, i: 0 };
  }
  function layerIndexToIndex(layer, i) {
    if (layer === 0) return i;
    if (layer === 1) return 5 + i;      // 5..8
    if (layer === 2) return 9 + i;      // 9..11
    if (layer === 3) return 12 + i;     // 12..13
    return 14;                          // 14
  }

  function paintColumnAsError(layer, i, borderHex) {
    const N = LAYERS[layer];
    for (let j = 0; j < N; j++) {
      const c = getCube(layer, i, j);
      setCubeValue(c, c.value, borderHex);
    }
  }

  // =========================
  // Interazione: palette + pick
  // =========================
  let selected = null;
  const paletteEl = document.getElementById('palette');
  if (paletteEl) {
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = n;
      chip.dataset.value = String(n);
      chip.addEventListener('click', () => {
        selected = n;
        [...paletteEl.children].forEach(el => el.classList.toggle('active', el === chip));
      });
      paletteEl.appendChild(chip);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickFrontSlot(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(cubes.map(c => c.mesh), true);
    if (!hits.length) return null;

    // risalgo al Group (cubo)
    let o = hits[0].object;
    while (o && !o.userData?.faces && o.parent) o = o.parent;
    if (!o) return null;

    const c = cubes.find(k => k.mesh === o);
    if (!c) return null;

    // solo layer 0, FILA FRONTALE (j === 0)
    if (c.layer !== 0 || c.j !== 0) return null;
    return c.i; // slot 0..4
  }

  // Mouse/Tap: click per assegnare numero
  renderer.domElement.addEventListener('click', (ev) => {
    if (selected == null) return;
    const idx = pickFrontSlot(ev.clientX, ev.clientY);
    if (idx == null) return;

    // applica su topRow
    topRow[idx] = selected;
    propagateAndPaint();
  });

  // Touch rotazione (drag su sfondo)
  let dragging = false, px = 0, py = 0;
  function onPointerDown(e) { dragging = true; px = e.clientX; py = e.clientY; }
  function onPointerUp() { dragging = false; }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = (e.clientX - px) / 140, dy = (e.clientY - py) / 140;
    scene.rotation.y += dx; scene.rotation.x += dy;
    px = e.clientX; py = e.clientY;
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointerup', onPointerUp, { passive: true });
  addEventListener('pointermove', onPointerMove, { passive: true });

  // =========================
  // Shuffle & Reset
  // =========================
  document.getElementById('btn-shuffle')?.addEventListener('click', () => {
    // 5 numeri distinti 1..15 random
    const numbers = Array.from({ length: 15 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    topRow = numbers.slice(0, 5);
    propagateAndPaint();
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    selected = null;
    if (paletteEl) [...paletteEl.children].forEach(el => el.classList.remove('active'));
    topRow = [0, 0, 0, 0, 0];
    propagateAndPaint();
  });

  // =========================
  // Avvio
  // =========================
  buildPyramid();
  propagateAndPaint();

  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
})();
