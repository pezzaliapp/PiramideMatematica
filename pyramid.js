/* pyramid.js – La Piramide Matematica 3D (completo)
   - Numeri inseribili su 5 cubi della fila frontale (layer 0, j=0)
   - Propagazione differenze assolute sui livelli inferiori
   - Evidenziazione rossa di duplicati e 0
   - Numeri su TUTTE le facce, cubi bianchi con bordo nero
*/

(() => {
  'use strict';

  // =================== DOM refs ===================
  const stageEl   = document.getElementById('stage');
  const paletteEl = document.getElementById('palette');
  const statusEl  = document.getElementById('status');
  const btnShuffle= document.getElementById('btn-shuffle');
  const btnReset  = document.getElementById('btn-reset');

  // =================== 3D Setup ===================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  camera.position.set(0, 34, 70);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stageEl.appendChild(renderer.domElement);

  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);

  // Gruppo che contiene tutta la piramide (per ruotarla facilmente)
  const root = new THREE.Group();
  scene.add(root);

  // Resize responsivo
  function onResize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  // Rotazione con drag (mouse/touch) sullo sfondo
  let dragging = false, px = 0, py = 0;
  function onPointerDown(e) { dragging = true; px = e.clientX; py = e.clientY; }
  function onPointerUp()   { dragging = false; }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = (e.clientX - px) / 140;
    const dy = (e.clientY - py) / 140;
    root.rotation.y += dx;
    root.rotation.x = Math.max(-1, Math.min(1, root.rotation.x + dy));
    px = e.clientX; py = e.clientY;
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);

  // =================== Geometrie / Materiali ===================
  const LAYERS = [5, 4, 3, 2, 1];  // 5×5 -> 1×1
  const STEP = 2.6;                // passo orizzontale/verticale
  const STEP_Y = 2.6;              // distanze tra layer
  const SIZE = 2.5;                // lato cubo
  const GEO_BOX = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

  // Crea texture con numero centrato; bgColor dipende da errore o meno
  const _texCache = new Map(); // key: `${num}-${bg}`
  function makeNumberTexture(num, bg = '#fff', fg = '#111') {
    const key = `${num}-${bg}-${fg}`;
    if (_texCache.has(key)) return _texCache.get(key);

    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);

    g.fillStyle = fg;
    g.font = 'bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Piccola compensazione verticale per ottica
    g.fillText(String(num), 128, 142);

    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = 4;
    tx.needsUpdate = true;
    _texCache.set(key, tx);
    return tx;
  }

  // Materiali per tutte le 6 facce con lo stesso numero
  function matsFor(num, isError = false) {
    const bg = isError ? '#ff3b30' : '#ffffff';
    const fg = '#111111';
    const tx = makeNumberTexture(num, bg, fg);
    const m = new THREE.MeshBasicMaterial({ map: tx });
    return [m, m, m, m, m, m];
  }

  // Bordo nero (come KubeApp)
  function makeEdges(mesh) {
    const geoE = new THREE.EdgesGeometry(mesh.geometry, 20);
    const lines = new THREE.LineSegments(geoE, new THREE.LineBasicMaterial({ color: 0x111111 }));
    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.scale.copy(mesh.scale);
    return lines;
  }

  // Coordinate centrate per (layer l, i orizzontale, j profondità)
  function posFor(l, i, j) {
    const N = LAYERS[l];
    const x = (i - (N - 1) / 2) * STEP;
    // Front row = j=0 è più vicino alla camera (z grande)
    const z = ((N - 1) / 2 - j) * STEP;
    const y = -l * STEP_Y;
    return new THREE.Vector3(x, y, z);
  }

  // =================== Strutture dati ===================
  // Conserviamo TUTTI i cubi, ma giochiamo sulla "diagonale" frontale (wedge)
  const cubes = []; // [{mesh, edge, l,i,j, wedge, value}]
  const wedgeByLayer = []; // array di array di cubi solo per j==l (la "scala" centrale)
  // Valori della "scala" logica (wedge): values[l][i] (l=0..4, i variabili)
  const values = LAYERS.map(N => Array(N).fill(null));

  // =================== Costruzione scena ===================
  function buildPyramid() {
    // pulizia
    for (const c of cubes) {
      root.remove(c.mesh);
      root.remove(c.edge);
    }
    cubes.length = 0;
    wedgeByLayer.length = 0;

    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      wedgeByLayer[l] = [];

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const mesh = new THREE.Mesh(GEO_BOX, matsFor(''));
          // all'inizio “cubi bianchi vuoti”: uso materiale bianco senza numero
          mesh.material = Array(6).fill(new THREE.MeshBasicMaterial({ color: 0xffffff }));
          mesh.position.copy(posFor(l, i, j));
          root.add(mesh);

          const edge = makeEdges(mesh);
          root.add(edge);

          const node = { mesh, edge, l, i, j, wedge: false, value: null };
          cubes.push(node);
        }
      }

      // Marca la "riga" della diagonale che usiamo per il gioco: quella con j==l
      const Nw = LAYERS[l];
      for (let i = 0; i < Nw; i++) {
        const node = cubes.find(o => o.l === l && o.i === i && o.j === l);
        node.wedge = true;
        wedgeByLayer[l][i] = node;
      }
    }

    // Posiziona la piramide un po' più in alto a schermo
    root.position.y = 6;
  }

  // =================== UI palette ===================
  function buildPalette() {
    if (!paletteEl) return;
    paletteEl.innerHTML = '';
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = n;
      chip.dataset.value = String(n);
      paletteEl.appendChild(chip);
    }
    paletteEl.addEventListener('click', onPickNumber);
  }

  let selectedNumber = null;
  function onPickNumber(e) {
    const btn = e.target.closest('.chip');
    if (!btn) return;

    // Attiva/disattiva selezione
    if (selectedNumber === Number(btn.dataset.value)) {
      selectedNumber = null;
      for (const c of paletteEl.querySelectorAll('.chip')) c.classList.remove('active');
      return;
    }
    selectedNumber = Number(btn.dataset.value);
    for (const c of paletteEl.querySelectorAll('.chip')) c.classList.remove('active');
    btn.classList.add('active');
  }

  // =================== Raycasting e inserimento ===================
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function getIntersections(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(root.children, false);
  }

  // Clic sul canvas: se tocco un cubo della fila frontale del layer 0 → inserisco
  function onClickCanvas(ev) {
    const hits = getIntersections(ev);
    if (!hits.length) return;

    // Trova il primo nodo “wedge”
    let pick = null;
    for (const h of hits) {
      const o = cubes.find(c => c.mesh === h.object);
      if (!o) continue;
      if (o.wedge && o.l === 0) { pick = o; break; } // solo fila frontale del layer 0
    }
    if (!pick) return;

    if (selectedNumber == null) return;   // nessun numero selezionato
    if (selectedNumber < 1 || selectedNumber > 15) return;

    // Imposta il valore scelto sul cubo selezionato (fila frontale, l=0)
    setValueAtTopIndex(pick.i, selectedNumber);
    recomputeAll();
    repaintAll();
  }
  renderer.domElement.addEventListener('click', onClickCanvas);

  // =================== Logica valori ===================
  function clearAll() {
    for (let l = 0; l < values.length; l++) {
      values[l].fill(null);
    }
    repaintAll();
    updateStatus();
  }

  function setValueAtTopIndex(i, v) {
    values[0][i] = v;
  }

  // Calcola le differenze assolute giù per la “scala”
  function recomputeAll() {
    // a scendere l=1..4, calcolo da riga superiore
    for (let l = 1; l < LAYERS.length; l++) {
      for (let i = 0; i < LAYERS[l]; i++) {
        const a = values[l - 1][i];
        const b = values[l - 1][i + 1];
        if (isFinite(a) && isFinite(b)) {
          values[l][i] = Math.abs(a - b);
        } else {
          values[l][i] = null;
        }
      }
    }
    updateStatus();
  }

  // Evidenzia duplicati su TUTTI i livelli (incluso 0) + marca 0 come errore
  function computeDuplicateSet() {
    const seen = new Map(); // num -> count
    for (let l = 0; l < values.length; l++) {
      for (let i = 0; i < values[l].length; i++) {
        const v = values[l][i];
        if (v == null) continue;
        seen.set(v, (seen.get(v) || 0) + 1);
      }
    }
    const dups = new Set();
    for (const [k, cnt] of seen) {
      if (k === 0 || cnt > 1) dups.add(k);
    }
    return dups;
  }

  // Conta quante DIFFERENZE uniche (1..15) ci sono tra i blocchi inferiori (l >= 1)
  function countUniqueDifferences() {
    const uni = new Set();
    for (let l = 1; l < values.length; l++) {
      for (const v of values[l]) {
        if (v == null || v === 0) continue; // 0 non ammesso
        uni.add(v);
      }
    }
    return uni.size; // su 10 possibili
  }

  function updateStatus() {
    if (!statusEl) return;
    statusEl.innerHTML = `Differenze uniche: <b>${countUniqueDifferences()}/10</b>`;
  }

  // Ridisegna TUTTO usando values + duplicati
  function repaintAll() {
    const dupSet = computeDuplicateSet();

    // Prima ripristina tutti i cubi a bianco “vuoto”
    for (const c of cubes) {
      c.value = null;
      c.mesh.material = Array(6).fill(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    }

    // Poi applica i numeri solo alla "scala" (j==l)
    for (let l = 0; l < LAYERS.length; l++) {
      for (let i = 0; i < LAYERS[l]; i++) {
        const node = wedgeByLayer[l][i];
        const v = values[l][i];
        if (v == null) continue;

        const isErr = v === 0 || dupSet.has(v);
        node.value = v;
        node.mesh.material = matsFor(v, isErr);
      }
    }
  }

  // =================== Azioni: Mescola e Reset ===================
  function shuffleTop5() {
    // scegli 5 numeri diversi da 1..15
    const pool = Array.from({ length: 15 }, (_, k) => k + 1);
    const pick = [];
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      pick.push(pool.splice(idx, 1)[0]);
    }
    for (let i = 0; i < 5; i++) values[0][i] = pick[i];
    recomputeAll();
    repaintAll();

    // aggiorna stato palette (opzionale: segna selezionati)
    for (const c of paletteEl.querySelectorAll('.chip')) c.classList.remove('active');
    selectedNumber = null;
  }

  function resetAll() {
    clearAll();
    // pulisci stato palette
    for (const c of paletteEl.querySelectorAll('.chip')) c.classList.remove('active');
    selectedNumber = null;
  }

  if (btnShuffle) btnShuffle.addEventListener('click', shuffleTop5);
  if (btnReset)   btnReset.addEventListener('click', resetAll);

  // =================== Avvio ===================
  buildPyramid();
  buildPalette();
  clearAll();

  // Render loop
  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

})();
