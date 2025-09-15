(() => {
  'use strict';

  /***********************
   * Scene & basic setup *
   ***********************/
  const stage = document.getElementById('stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(0, 36, 60);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  stage.appendChild(renderer.domElement);

  // Gruppo per ruotare tutta la piramide
  const root = new THREE.Group();
  scene.add(root);

  // Luci leggere (i materiali testo sono Basic quindi non servono, ma le linee nere rendono meglio con un po' di luce)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.25);
  scene.add(hemi);

  function onResize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  /**********************
   * Geometry constants *
   **********************/
  const LAYERS = [5, 4, 3, 2, 1];     // 5×5 → 1×1
  const STEP = 2.2;                   // passo tra i centri X/Z
  const STEP_Y = 2.2;                 // distanza vert.
  const CUBE = 2.0;                   // lato cubo (un filo più piccolo dello step)
  const GEO = new THREE.BoxGeometry(CUBE, CUBE, CUBE);

  // Edges (bordo nero stile Kube)
  function addEdges(mesh) {
    const edges = new THREE.EdgesGeometry(GEO);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x0c0f16, linewidth: 1 }));
    mesh.add(line);
  }

  /***********************
   * Texture dei numeri  *
   ***********************/
  function makeNumberCanvas(n, color = '#111', bg = '#fff') {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    // sfondo
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    // numero
    g.fillStyle = color;
    g.font = 'bold 168px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 128, 138);
    return c;
  }

  function materialFor(n, duplicate = false, isInvalid = false) {
    // duplicate => rosso, invalid (0 o fuori range) => rosso acceso
    const wantRed = duplicate || isInvalid;
    const mapCanvas = makeNumberCanvas(
      n ?? '',
      wantRed ? '#ffffff' : '#111',
      wantRed ? '#ff3b30' : '#ffffff'
    );
    const tex = new THREE.CanvasTexture(mapCanvas);
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
    // Stesso materiale su tutte le 6 facce
    return [mat, mat, mat, mat, mat, mat];
  }

  const blankMat = materialFor('');

  /**********************
   * Disposizione cubi  *
   **********************/
  function positionFor(layerIdx, i, j) {
    const N = LAYERS[layerIdx];
    const x = (i - (N - 1) / 2) * STEP;
    const z = (j - (N - 1) / 2) * STEP;
    const y = -layerIdx * STEP_Y;
    return new THREE.Vector3(x, y, z);
  }

  // Struttura dati per slot
  const slots = []; // flat array di {mesh, layer, i, j, value, edgesLine}
  const frontSlots = []; // solo i 5 della fila frontale (layer=0, j = 0..0 con depth pos? → vedi sotto)

  function buildPyramid() {
    // pulizia
    while (root.children.length) root.remove(root.children[0]);
    slots.length = 0;
    frontSlots.length = 0;

    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const mesh = new THREE.Mesh(GEO, blankMat);
          mesh.position.copy(positionFor(l, i, j));
          root.add(mesh);
          addEdges(mesh);

          const slot = { mesh, layer: l, i, j, value: null, duplicate: false, invalid: false };
          slots.push(slot);

          // I 5 frontali “interattivi” sono quelli del layer 0
          // e della fila "fronte" verso camera. Scegliamo j = 0
          // come fila frontale (coerente con posFor e camera).
          if (l === 0 && j === 0) frontSlots.push(slot);
        }
      }
    }
  }

  /************************
   * Utility sugli  indici *
   ************************/
  function slotAt(layer, i, j) {
    const N = LAYERS[layer];
    // mappa lineare: somma delle celle dei layer precedenti + indice nel layer
    let base = 0;
    for (let k = 0; k < layer; k++) base += LAYERS[k] * LAYERS[k];
    return slots[base + i * N + j];
  }

  // Replicazione lungo Z (profondità) di un valore dato lo slot “frontale” (j=0)
  function replicateRowFromFront(layer, i, value) {
    const N = LAYERS[layer];
    for (let j = 0; j < N; j++) {
      const s = slotAt(layer, i, j);
      s.value = value;
    }
  }

  // Applica materiali coerenti (numero su tutte le facce + highlight se serve)
  function repaintAllFaces(layer, i) {
    const N = LAYERS[layer];
    for (let j = 0; j < N; j++) {
      const s = slotAt(layer, i, j);
      const mats = (s.value == null)
        ? blankMat
        : materialFor(s.value, s.duplicate, s.invalid);
      s.mesh.material = mats;
    }
  }

  /*************************************
   * Logica differenze e validazioni   *
   *************************************/
  // Calcola differenze assolute lungo la "triangolazione" frontale (i=0..size-1, layer 0..4),
  // usando i 5 valori della riga frontale del top (layer=0, j=0) e propagando.
  function recomputeDifferences() {
    // Prendiamo solo i frontali j=0 per ogni layer,
    // e lavoriamo sull'indice i (0..N-1).
    // 1) Otteniamo i 5 del layer0
    const top = [];
    for (let i = 0; i < 5; i++) top.push(slotAt(0, i, 0).value);

    // 2) Propaga se e solo se i valori necessari esistono
    // layer 1: 4 celle => |a0-a1|, |a1-a2|, |a2-a3|, |a3-a4|
    for (let li = 1; li < LAYERS.length; li++) {
      const prevN = LAYERS[li - 1];
      const N = LAYERS[li];
      for (let i = 0; i < N; i++) {
        const A = slotAt(li - 1, i, 0).value;
        const B = slotAt(li - 1, i + 1, 0).value;
        const dest = slotAt(li, i, 0);
        if (A == null || B == null) {
          dest.value = null;
        } else {
          dest.value = Math.abs(A - B);
        }
        // replica lungo Z di ogni cella appena ricalcolata
        replicateRowFromFront(li, i, dest.value);
      }
    }
  }

  function computeDuplicatesAndInvalid() {
    // Duplicati: conteggiamo tutti i valori *presenti* (non null) su tutte le celle frontali (j=0) in tutti i layer
    const count = new Map();
    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        const v = slotAt(l, i, 0).value;
        if (v == null) continue;
        count.set(v, (count.get(v) || 0) + 1);
      }
    }
    // Applichiamo flag duplicate/invalid a TUTTE le celle (tutta la profondità)
    for (const s of slots) {
      const v = s.value;
      const dup = (v != null) && (count.get(v) > 1);
      const invalid = (v === 0) || (v != null && (!Number.isInteger(v) || v < 1 || v > 99)); // 0 non ammesso
      s.duplicate = !!dup;
      s.invalid = !!invalid;
    }
  }

  function repaintAll() {
    for (const s of slots) {
      const mats = (s.value == null) ? blankMat : materialFor(s.value, s.duplicate, s.invalid);
      s.mesh.material = mats;
    }
  }

  // “Differenze uniche”: quante distinte tra i layer 1..4 (escludendo null e 0)
  function updateStatus() {
    const uniq = new Set();
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        const v = slotAt(l, i, 0).value;
        if (v == null || v === 0) continue;
        uniq.add(v);
      }
    }
    const el = document.getElementById('status');
    if (el) el.innerHTML = `Differenze uniche: <b>${uniq.size}/10</b>`;
  }

  /**********************
   * Interazione utente *
   **********************/
  let selectedValue = null;

  // Palette (chip 1..15)
  function buildPalette() {
    const pal = document.getElementById('palette');
    if (!pal) return;
    pal.innerHTML = '';
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = n;
      chip.addEventListener('click', () => {
        selectedValue = n;
        // highlight chip selezionato
        for (const c of pal.querySelectorAll('.chip')) c.classList.remove('active');
        chip.classList.add('active');
      });
      pal.appendChild(chip);
    }
  }

  // Picking (consentito solo sui 5 slot frontali del layer 0)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onClickCanvas(ev) {
    if (selectedValue == null) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(root.children, true);
    if (!intersects.length) return;

    // Trova lo slot frontale più vicino
    const mesh = intersects[0].object.parent?.isMesh ? intersects[0].object.parent : intersects[0].object;
    const slot = slots.find(s => s.mesh === mesh);
    if (!slot) return;

    // Consentito solo se l=0 e j=0 (fila frontale del top)
    if (!(slot.layer === 0 && slot.j === 0)) return;

    // Assegna
    applyAtTopFront(slot.i, selectedValue);
  }

  function applyAtTopFront(i, value) {
    // Scrivi il valore nello slot frontale top (j=0), replica lungo Z e poi ricalcola differenze
    replicateRowFromFront(0, i, value);
    repaintAllFaces(0, i);

    // Propagazione e validazioni
    recomputeDifferences();
    computeDuplicatesAndInvalid();
    repaintAll();
    updateStatus();
  }

  renderer.domElement.addEventListener('click', onClickCanvas);

  // Shuffle: sceglie 5 numeri univoci 1..15 e li mette sui 5 frontali (ordine random)
  function shuffleTop5() {
    const pool = Array.from({ length: 15 }, (_, k) => k + 1);
    // estrai 5 distinct
    const five = [];
    for (let r = 0; r < 5; r++) {
      const idx = Math.floor(Math.random() * pool.length);
      five.push(pool.splice(idx, 1)[0]);
    }
    // mescola l’ordine
    five.sort(() => Math.random() - 0.5);

    // scrivi
    for (let i = 0; i < 5; i++) {
      replicateRowFromFront(0, i, five[i]);
      repaintAllFaces(0, i);
    }
    recomputeDifferences();
    computeDuplicatesAndInvalid();
    repaintAll();
    updateStatus();
  }

  // Reset pulisce tutto
  function resetAll() {
    for (const s of slots) {
      s.value = null;
      s.duplicate = false;
      s.invalid = false;
      s.mesh.material = blankMat;
    }
    selectedValue = null;
    // togli highlight dalla palette
    const pal = document.getElementById('palette');
    if (pal) pal.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    updateStatus();
  }

  // Bottoni
  document.getElementById('btn-shuffle')?.addEventListener('click', shuffleTop5);
  document.getElementById('btn-reset')?.addEventListener('click', resetAll);

  /*****************
   * Camera orbit  *
   *****************/
  let dragging = false, px = 0, py = 0;
  function beginDrag(e) { dragging = true; px = e.clientX ?? e.touches?.[0]?.clientX; py = e.clientY ?? e.touches?.[0]?.clientY; }
  function endDrag() { dragging = false; }
  function moveDrag(e) {
    if (!dragging) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    const dx = (cx - px) / 140;
    const dy = (cy - py) / 140;
    root.rotation.y += dx;
    root.rotation.x += dy;
    px = cx; py = cy;
  }
  renderer.domElement.addEventListener('pointerdown', beginDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointermove', moveDrag, { passive: true });
  // Touch-friendly
  renderer.domElement.style.touchAction = 'none';

  /*****************
   * Avvio         *
   *****************/
  buildPyramid();
  buildPalette();
  updateStatus();

  // loop
  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
})();
