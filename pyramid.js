(() => {
  'use strict';

  // ====== DOM ======
  const stageEl   = document.getElementById('stage');
  const paletteEl = document.getElementById('palette');
  const shuffleBtn= document.getElementById('btn-shuffle');
  const resetBtn  = document.getElementById('btn-reset');
  const statusEl  = document.getElementById('status');

  // ====== THREE: scena/camera/renderer ======
  const scene = new THREE.Scene();

  // bianco pieno: lasciamo lo sfondo del canvas trasparente e usiamo CSS; se vuoi background 3D:
  // scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(16, 18, 42);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stageEl.clientWidth, stageEl.clientHeight);
  stageEl.appendChild(renderer.domElement);

  // luce discreta per vedere i bordi; i numeri sono MeshBasic (non influenzati)
  const amb = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.35);
  dir.position.set(20, 30, 12);
  scene.add(dir);

  function onResize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  // ====== Geometrie / Materiali ======
  const STEP = 1.6;     // passo tra i centri, X/Z
  const STEP_Y = 1.6;   // passo verticale tra layer
  const SIZE = 1.52;    // dimensione cubo (≈ STEP per “compattare”)
  const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

  // Base: bianco con bordo nero
  const MAT_EMPTY = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const MAT_RED   = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  function addEdges(mesh) {
    const e = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: 0x000000 }));
    line.renderOrder = 1;
    mesh.add(line);
  }

  // ====== Struttura dati piramide ======
  // layersSizes[0]=5, [1]=4, [2]=3, [3]=2, [4]=1
  const layersSizes = [5, 4, 3, 2, 1];

  // Mesh dei cubi: cubes[layer][i][j]  (0..N-1, 0..N-1)
  const cubes = [];

  // Valori logici (quelli del gioco): values[layer] è un array lungo N,
  // rappresenta la “fila frontale” di ogni layer (quella che guida la piramide).
  // Il resto delle posizioni del layer replica il valore corrispondente della fila frontale.
  const values = layersSizes.map(n => Array(n).fill(null));

  // Numero scelto in palette (1..15) oppure null
  let selectedNumber = null;

  // ====== Utility coordinate ======
  function posFor(layer, i, j) {
    // layer: 0..4, size N
    const N = layersSizes[layer];
    // centro il layer: i → X, j → Z (frontale = j=0)
    const x = (i - (N - 1) / 2) * STEP;
    const z = (j - (N - 1) / 2) * STEP;
    const y = -layer * STEP_Y; // base in alto, punta in basso (negativo scende)
    return new THREE.Vector3(x, y, z);
  }

  // ====== Numeri su tutte le facce ======
  function makeNumberCanvas(n, fg = '#000', bg = '#fff') {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    if (Number.isInteger(n)) {
      g.fillStyle = fg;
      g.font = 'bold 180px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), 128, 140);
    }
    return new THREE.CanvasTexture(c);
  }

  function applyNumberOnAllFaces(mesh, n, fg = '#000', bg = '#fff') {
    const tex = makeNumberCanvas(n, fg, bg);
    const perFace = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ map: tex }));
    mesh.material = perFace;
  }

  function clearToBaseWhite(mesh) {
    mesh.material = MAT_EMPTY.clone();
  }

  // ====== Costruzione piramide ======
  function buildPyramid() {
    // pulizia precedente
    for (const l of cubes) for (const row of l) for (const m of row) scene.remove(m);
    cubes.length = 0;

    for (let layer = 0; layer < layersSizes.length; layer++) {
      const N = layersSizes[layer];
      const layerArr = [];
      for (let i = 0; i < N; i++) {
        const rowArr = [];
        for (let j = 0; j < N; j++) {
          const mesh = new THREE.Mesh(GEO, MAT_EMPTY.clone());
          addEdges(mesh);
          mesh.position.copy(posFor(layer, i, j));
          mesh.userData = { layer, i, j };
          scene.add(mesh);
          rowArr.push(mesh);
        }
        layerArr.push(rowArr);
      }
      cubes.push(layerArr);
    }
    repaintAll();
  }

  // ====== Replica valori su tutto il layer ======
  function repaintAll() {
    // Layer 0..4: per ogni layer, per colonna i, prendi values[layer][i] e applicalo a tutte le celle (j=0..N-1)
    for (let layer = 0; layer < layersSizes.length; layer++) {
      const N = layersSizes[layer];
      for (let i = 0; i < N; i++) {
        const v = values[layer][i];
        for (let j = 0; j < N; j++) {
          const m = cubes[layer][i][j];
          if (Number.isInteger(v)) {
            applyNumberOnAllFaces(m, v, '#000', '#fff');
          } else {
            clearToBaseWhite(m);
          }
        }
      }
    }
    highlightDuplicatesFrontRow();
    repaintStatus();
  }

  // ====== Logica: set e differenze a cascata ======
  function setValueAtFront(index, n) {
    // index: 0..4, layer 0 front row
    values[0][index] = n;
    recomputeDifferences();
    repaintAll();
  }

  function recomputeDifferences() {
    // layer k+1 ha lunghezza N-1 = abs(diff) tra values[k][i] e values[k][i+1], se entrambi definiti
    for (let layer = 0; layer < layersSizes.length - 1; layer++) {
      const cur = values[layer];
      const next = values[layer + 1];
      for (let i = 0; i < next.length; i++) {
        const a = cur[i];
        const b = cur[i + 1];
        next[i] = (Number.isInteger(a) && Number.isInteger(b)) ? Math.abs(a - b) : null;
      }
    }
  }

  // ====== Highlight duplicati fila frontale ======
  function highlightDuplicatesFrontRow() {
    const top = values[0]; // 5 elementi
    const count = new Map();
    for (const v of top) {
      if (!Number.isInteger(v)) continue;
      count.set(v, (count.get(v) || 0) + 1);
    }
    // applica: duplicati rossi, altrimenti bianco
    const N = layersSizes[0]; // 5
    for (let i = 0; i < N; i++) {
      const v = top[i];
      const isDup = Number.isInteger(v) && count.get(v) > 1;
      for (let j = 0; j < N; j++) {
        const m = cubes[0][i][j];
        if (Number.isInteger(v)) {
          if (isDup) {
            applyNumberOnAllFaces(m, v, '#ffffff', '#ff3b30'); // numero bianco su rosso
          } else {
            applyNumberOnAllFaces(m, v, '#000000', '#ffffff'); // numero nero su bianco
          }
        } else {
          clearToBaseWhite(m);
        }
      }
    }
  }

  // ====== Stato: differenze uniche (tra i 10 blocchi sotto) ======
  function repaintStatus() {
    // raccogli tutti i valori definiti nei layer 1..4 (4+3+2+1 = 10 posizioni)
    const seen = new Set();
    for (let layer = 1; layer < values.length; layer++) {
      for (const v of values[layer]) {
        if (Number.isInteger(v)) seen.add(v);
      }
    }
    statusEl.innerHTML = `Differenze uniche: <b>${seen.size}/10</b>`;
  }

  // ====== Palette 1..15 ======
  function buildPalette() {
    paletteEl.innerHTML = '';
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = n;
      chip.addEventListener('click', () => {
        // selezione visiva
        [...paletteEl.children].forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedNumber = n; // NON facciamo highlight qui.
      });
      paletteEl.appendChild(chip);
    }
  }

  // ====== Picking fila frontale (layer 0, j=0..N-1) ======
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    // Intersechiamo solo il layer 0 (fila frontale) per semplicità;
    // troviamo il mesh più vicino che appartiene al layer 0.
    const layer0 = [];
    const N = layersSizes[0];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) layer0.push(cubes[0][i][j]);
    const hits = ray.intersectObjects(layer0, false);
    if (!hits.length) return null;
    // scegli il più vicino
    return hits[0].object;
  }

  // Click/tap: assegna solo se hai selezionato un numero e hai preso un cubo del layer 0
  function tryAssignFromPointer(e) {
    const m = pick(e);
    if (!m) return;
    const ud = m.userData;
    if (ud.layer !== 0) return;
    if (selectedNumber == null) return;
    // ud.i è la “colonna” nella fila frontale
    setValueAtFront(ud.i, selectedNumber);
  }

  // ====== Rotazione scena (drag background) ======
  let dragging = false;
  let px = 0, py = 0;

  function isOnCanvas(e) {
    return e.target === renderer.domElement || e.target === stageEl;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!isOnCanvas(e)) return;
    dragging = true; px = e.clientX; py = e.clientY;
  });
  window.addEventListener('pointerup', () => dragging = false);
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - px) / 140;
    const dy = (e.clientY - py) / 140;
    scene.rotation.y += dx;
    scene.rotation.x += dy;
    px = e.clientX; py = e.clientY;
  }, { passive: true });

  // Tap singolo per assegnare (anche su iPhone)
  renderer.domElement.addEventListener('click', (e) => {
    // un click breve senza drag e con un numero selezionato → assegna
    tryAssignFromPointer(e);
  });

  // ====== Bottoni ======
  shuffleBtn.addEventListener('click', () => {
    // scegli 5 numeri distinti 1..15
    const pool = Array.from({ length: 15 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const take = pool.slice(0, 5).sort((a, b) => a - b);
    values[0] = take.slice();         // imposta la riga frontale
    recomputeDifferences();
    repaintAll();
    // selezione palette sul primo numero per comodità
    selectedNumber = take[0];
    [...paletteEl.children].forEach(c => c.classList.remove('active'));
    const chip = [...paletteEl.children].find(el => +el.textContent === selectedNumber);
    if (chip) chip.classList.add('active');
  });

  resetBtn.addEventListener('click', () => {
    for (let l = 0; l < values.length; l++) values[l].fill(null);
    selectedNumber = null;
    [...paletteEl.children].forEach(c => c.classList.remove('active'));
    repaintAll();
  });

  // ====== Avvio ======
  buildPalette();
  buildPyramid();
  repaintAll();

  // ====== Loop render ======
  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
})();
