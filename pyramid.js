<script>
// pyramid.js  –  Piramide Matematica 3D (5,4,3,2,1)
// Richiede: three.js già incluso. Funziona con r150+ (anche precedenti).

(() => {
  'use strict';

  /* -------------------- Setup base -------------------- */
  const stage = document.getElementById('stage');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff); // sfondo bianco

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(0, 26, 46);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  stage.appendChild(renderer.domElement);

  // luci morbide (il numero è disegnato via texture, quindi nessun problema)
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.45);
  dir.position.set(10, 20, 14);
  scene.add(dir);

  function onResize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', onResize, { passive: true });
  onResize();

  /* -------------------- Geometria & layout -------------------- */
  // livelli: 5x5 → 4x4 → 3x3 → 2x2 → 1x1
  const LAYERS = [5, 4, 3, 2, 1];

  const STEP = 2.2;      // passo x/z tra i centri
  const STEP_Y = 2.2;    // passo verticale tra layer
  const SIZE = 2.0;      // lato cubo (più piccolo del passo per vedere i bordi)
  const GEO = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

  // materiale bianco base + bordo nero (Edges)
  const WHITE = 0xffffff;
  const RED   = 0xff3b30; // highlight errori
  const BLACK = 0x111111;

  function buildWhiteMaterialsWithNumber(num) {
    // 6 lati MeshBasic con stessa texture (numero oppure vuoto)
    const tex = makeNumberTexture(num); // se null → facce bianche
    const mats = new Array(6).fill(0).map(() => {
      const m = new THREE.MeshBasicMaterial({ color: WHITE });
      if (tex) m.map = tex;
      return m;
    });
    return mats;
  }

  // helper: centro layer e piramide
  function posFor(layerIdx, i, j) {
    const N = LAYERS[layerIdx];
    const x = (i - (N - 1) / 2) * STEP;
    const z = (j - (N - 1) / 2) * STEP;
    const y = -layerIdx * STEP_Y; // base in alto, scendo verso la punta
    return new THREE.Vector3(x, y, z);
  }

  /* -------------------- Numero su tutte le facce -------------------- */
  function makeNumberTexture(value) {
    // se null/undefined ⇒ nessuna texture (lati bianchi)
    if (value == null) return null;

    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    // fondo bianco
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);

    // bordo sottile grigio chiaro per dare “riga nera” (i veri bordi sono gli Edges)
    g.strokeStyle = '#111111';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 250);

    // numero nero, centrato
    g.fillStyle = '#111111';
    g.font = 'bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(value), 128, 138);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function setCubeNumber(mesh, value) {
    // aggiorna le 6 facce con il numero (o vuoto)
    const mats = buildWhiteMaterialsWithNumber(value);
    mesh.material = mats;
    mesh.userData.value = value;
    mesh.userData.error = false;
    // rimetti aiuto: colore base bianco
    mesh.userData.color = WHITE;
  }

  function setCubeError(mesh, isError) {
    // colora il cubo (moltiplica la texture) — rosso per errore, bianco altrimenti
    const color = isError ? RED : WHITE;
    mesh.userData.error = !!isError;
    (mesh.material || []).forEach(m => {
      if (m) m.color.setHex(color);
    });
  }

  function addEdgesTo(mesh) {
    const edges = new THREE.EdgesGeometry(GEO);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: BLACK, linewidth: 1 })
    );
    mesh.add(line);
  }

  /* -------------------- Costruzione piramide -------------------- */
  const cubes = []; // tutti i cubi (per repaint globale)
  const frontSlots = []; // i 5 cubi “frontali” sulla riga 5×5 (in alto, j==0)

  function buildPyramid() {
    // pulizia
    for (const c of cubes) scene.remove(c.mesh);
    cubes.length = 0;
    frontSlots.length = 0;

    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const mesh = new THREE.Mesh(GEO, buildWhiteMaterialsWithNumber(null));
          mesh.position.copy(posFor(l, i, j));
          mesh.userData.layer = l;
          mesh.userData.i = i;
          mesh.userData.j = j;
          mesh.userData.value = null;
          addEdgesTo(mesh);
          scene.add(mesh);
          cubes.push({ mesh, l, i, j });

          // memorizzo gli slot frontali del PRIMO layer (l=0, j=0)
          if (l === 0 && j === 0) {
            frontSlots.push(mesh);
          }
        }
      }
    }
  }

  /* -------------------- Logica: differenze & duplicati -------------------- */
  // frontValues: i 5 valori della fila frontale (layer 0, j=0) – null se vuoto
  function readFrontRowValues() {
    // frontSlots è in ordine (i:0..4)
    return frontSlots.map(m => m.userData.value ?? null);
  }

  function clearComputedBelow() {
    // svuota i numeri dei cubi FRONTALI dei layer 1..4 (j==0)
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        const m = pickFront(l, i); // frontale del layer l all’indice i
        setCubeNumber(m, null);
        setCubeError(m, false);
      }
    }
  }

  function computeDifferences() {
    // Calcola differenze assolute per 4 righe (5→4→3→2→1) sui cubi frontali
    // Se manca qualche numero nella riga corrente, le righe sotto restano vuote.
    let row = readFrontRowValues();
    if (row.some(v => v == null)) {
      clearComputedBelow();
      return;
    }

    for (let l = 1; l < LAYERS.length; l++) {
      const next = [];
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i];
        const b = row[i + 1];
        const d = Math.abs(a - b);
        const m = pickFront(l, i);
        setCubeNumber(m, d);
        next.push(d);
      }
      row = next;
    }
  }

  function highlightDuplicatesAndZeros() {
    // evidenzia duplicati & zeri in TUTTE le righe frontali (layer 0..4, j==0)
    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      const values = [];
      for (let i = 0; i < N; i++) {
        const m = pickFront(l, i);
        values.push({ m, v: m.userData.value });
      }
      // mappa occorrenze (escludo null)
      const occ = new Map();
      for (const { v } of values) {
        if (v == null) continue;
        occ.set(v, (occ.get(v) || 0) + 1);
      }
      // applico colore rosso se duplicato o zero
      for (const { m, v } of values) {
        const dup = v != null && (occ.get(v) || 0) > 1;
        const bad = v === 0; // 0 non ammesso
        setCubeError(m, dup || bad);
      }
    }
  }

  function repaintStatus() {
    // contatore “Differenze uniche” = quanti valori distinti (escluso null e 0)
    const s = document.getElementById('status');
    let uniques = new Set();
    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        const m = pickFront(l, i);
        const v = m.userData.value;
        if (v != null && v !== 0) uniques.add(v);
      }
    }
    s.innerHTML = `Differenze uniche: <b>${uniques.size}/10</b>`;
  }

  function recomputeAll() {
    computeDifferences();
    highlightDuplicatesAndZeros();
    repaintStatus();
  }

  /* -------------------- Input & interazione -------------------- */
  let selectedValue = null;

  // palette 1..15
  function buildPalette() {
    const row = document.getElementById('palette');
    row.innerHTML = '';
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = n;
      chip.addEventListener('click', () => {
        selectedValue = n;
        // evidenzia scelta
        for (const b of row.querySelectorAll('.chip')) b.classList.remove('active');
        chip.classList.add('active');
      });
      row.appendChild(chip);
    }
  }

  // click su cubo: solo se è uno dei 5 frontali della riga alta (layer 0, j==0)
  function onClickCanvas(ev) {
    const pick = pickFrontSlot(ev.clientX, ev.clientY);
    if (!pick) return;
    if (selectedValue == null) return;
    // assegna numero al cubo frontale scelto (e lo mostra su tutte le facce)
    setCubeNumber(pick, selectedValue);
    recomputeAll();
  }

  // util: prende il cubo FRONT (j==0) del layer l e indice i
  function pickFront(layerIdx, i) {
    const N = LAYERS[layerIdx];
    // each layer has its own i range; i è già valido
    // cerco per proprietà: layer, i, j==0
    // (volendo si può indicizzare, ma così è chiaro)
    for (const c of cubes) {
      if (c.l === layerIdx && c.i === i && c.j === 0) return c.mesh;
    }
    return null;
  }

  // raycast click → ritorna uno dei 5 frontali (layer 0, j==0), altrimenti null
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickFrontSlot(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(frontSlots, false);
    return hits.length ? hits[0].object : null;
  }

  // drag per la rotazione (mouse & touch via pointer events)
  let dragging = false, px = 0, py = 0;
  renderer.domElement.style.touchAction = 'none'; // importante per iPhone
  renderer.domElement.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
  addEventListener('pointerup',   () => dragging = false);
  addEventListener('pointerleave',() => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = (e.clientX - px) / 140;
    const dy = (e.clientY - py) / 140;
    scene.rotation.y += dx;
    scene.rotation.x = Math.max(-0.9, Math.min(0.9, scene.rotation.x + dy));
    px = e.clientX; py = e.clientY;
  });

  renderer.domElement.addEventListener('click', onClickCanvas);

  // SHUFFLE: sceglie 5 numeri unici 1..15 casuali e li mette sulla riga frontale
  document.getElementById('btn-shuffle')?.addEventListener('click', () => {
    const bag = Array.from({ length: 15 }, (_, i) => i + 1);
    // estrazione senza ripetizioni
    const chosen = [];
    for (let k = 0; k < 5; k++) {
      const at = Math.floor(Math.random() * bag.length);
      chosen.push(bag.splice(at, 1)[0]);
    }
    // applica
    for (let i = 0; i < 5; i++) setCubeNumber(frontSlots[i], chosen[i]);
    recomputeAll();
  });

  // RESET: svuota tutto
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    for (const m of frontSlots) setCubeNumber(m, null);
    clearComputedBelow();
    highlightDuplicatesAndZeros();
    repaintStatus();
    // pulisco selezione palette
    const row = document.getElementById('palette');
    row?.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    selectedValue = null;
  });

  /* -------------------- Avvio -------------------- */
  buildPalette();
  buildPyramid();
  clearComputedBelow();
  highlightDuplicatesAndZeros();
  repaintStatus();

  // render loop
  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

})();
</script>
