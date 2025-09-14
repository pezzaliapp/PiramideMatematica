// pyramid.js — Piramide 5x5,4x4,3x3,2x2,1x1
(() => {
  'use strict';

  // ------- setup base -------
  const stage = document.getElementById('stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  camera.position.set(0, 36, 58);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);

  function onResize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', onResize, { passive: true });
  onResize();

  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(12, 18, 14);
  scene.add(dir);

  // ------- geometria & materiali -------
  const STEP = 2.2;
  const STEP_Y = 2.2;
  const SIZE = 2.1;
  const GEO = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

  // bordo nero (linee) intorno ai cubi bianchi
  function addEdges(mesh) {
    const edges = new THREE.EdgesGeometry(GEO);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
    mesh.add(line);
  }

  // canvas numerico (bianco/nero); usato per tutte le facce
  function makeNumberCanvas(n) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    // fondo bianco
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    // cifra nera
    g.fillStyle = '#000000';
    g.font = 'bold 180px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (Number.isFinite(n)) g.fillText(String(n), 128, 146);
    return c;
  }

  function makeNumberTexture(n) {
    const tx = new THREE.CanvasTexture(makeNumberCanvas(n));
    tx.anisotropy = 4;
    tx.needsUpdate = true;
    return tx;
  }

  // materiali: stesso numero su tutte e 6 le facce
  function matsFor(n) {
    const map = Number.isFinite(n) ? makeNumberTexture(n) : null;
    const base = new THREE.MeshBasicMaterial({ color: 0xffffff, map });
    // sei materiali identici
    return [base.clone(), base.clone(), base.clone(), base.clone(), base.clone(), base.clone()];
  }

  // materiale rosso d'errore (sovrascrive il bianco)
  const ERR_MAT = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  // ------- dati di gioco -------
  const LAYERS = [5, 4, 3, 2, 1]; // top->bottom
  const values = [];              // values[l][i][j] (0=vuoto; 1..15 valido)
  const cubes = [];               // {mesh,l,i,j}

  // posizione centrata
  function posFor(l, i, j) {
    const N = LAYERS[l];
    const x = (i - (N - 1) / 2) * STEP;
    const z = (j - (N - 1) / 2) * STEP;
    const y = -l * STEP_Y;
    return new THREE.Vector3(x, y, z);
  }

  // costruzione piramide vuota
  function buildPyramid() {
    // clear
    for (const c of cubes) scene.remove(c.mesh);
    cubes.length = 0;
    values.length = 0;

    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      values[l] = Array.from({ length: N }, () => Array(N).fill(0));
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const mesh = new THREE.Mesh(GEO, matsFor(null));
          mesh.position.copy(posFor(l, i, j));
          addEdges(mesh);
          mesh.userData = { l, i, j };
          scene.add(mesh);
          cubes.push({ mesh, l, i, j });
        }
      }
    }
  }

  // ------- input & UI -------
  // rotazione scena (mouse/touch)
  {
    let dragging = false, px = 0, py = 0;
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
    addEventListener('pointerup', () => dragging = false);
    addEventListener('pointercancel', () => dragging = false);
    addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = (e.clientX - px) / 140, dy = (e.clientY - py) / 140;
      scene.rotation.y += dx; scene.rotation.x += dy;
      px = e.clientX; py = e.clientY;
    }, { passive: true });
  }

  // palette in alto (1..15)
  const paletteEl = document.getElementById('palette') || (function () {
    const bar = document.querySelector('.bar');
    const row = document.createElement('div');
    row.id = 'palette';
    row.className = 'row';
    bar.insertBefore(row, bar.querySelector('.btns'));
    return row;
  })();

  function buildPalette() {
    paletteEl.innerHTML = '';
    for (let n = 1; n <= 15; n++) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = String(n);
      chip.dataset.n = String(n);
      paletteEl.appendChild(chip);
    }
  }

  let selectedN = 1;
  function wirePalette() {
    paletteEl.addEventListener('click', e => {
      const el = e.target.closest('.chip');
      if (!el) return;
      selectedN = parseInt(el.dataset.n, 10);
      [...paletteEl.children].forEach(c => c.classList.toggle('active', c === el));
    });
    // default attivo = 1
    paletteEl.firstElementChild?.classList.add('active');
  }

  // picking: si può scrivere solo sulla **fila frontale** del primo layer (5 cubi)
  function pickFrontSlot(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(
      (x / renderer.domElement.clientWidth) * 2 - 1,
      -(y / renderer.domElement.clientHeight) * 2 + 1
    ), camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      const o = h.object;
      const ud = o.userData || (o.parent && o.parent.userData);
      if (!ud) continue;
      const { l, i, j } = ud;
      if (l === 0 && i === 0) {           // fila frontale del layer 0 (5x5), indice i==0 (fronte)
        return { l, i, j };
      }
    }
    return null;
  }

  renderer.domElement.addEventListener('click', e => {
    const p = pickFrontSlot(e.clientX, e.clientY);
    if (!p) return;
    setValueAtFront(p.j, selectedN); // j = colonna sulla fila frontale
  });

  // ------- logica numeri -------
  // setta un valore nella fila frontale del layer 0, poi ricalcola differenze
  function setValueAtFront(col, v) {
    if (!(v >= 1 && v <= 15)) return; // 0 non ammesso in input
    values[0][0][col] = v;
    repaintBaseFromTopRow();
  }

  // calcola differenze assolute verso il basso; 0 = slot non ancora determinabile
  function computeDifferences() {
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          // i,j sul layer l ricevono da (i, j) e (i+1, j) del layer superiore (l-1)
          const a = values[l - 1][i][j];
          const b = values[l - 1][i + 1][j];
          if (a > 0 && b > 0) {
            const diff = Math.abs(a - b);
            values[l][i][j] = diff; // se diff==0 => errore: verrà evidenziato
          } else {
            values[l][i][j] = 0;
          }
        }
      }
    }
  }

  // trova i duplicati **su tutta la piramide** (escludendo gli 0)
  function computeDuplicatesSet() {
    const counts = new Map();
    for (let l = 0; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const v = values[l][i][j];
          if (!v) continue;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
    }
    const dup = new Set();
    for (const [k, c] of counts) if (c > 1) dup.add(k);
    return dup;
  }

  // applica numeri ai cubi; bianco per default, rosso se (dup) o (0)
  function repaintAll() {
    // numeri
    for (const { mesh, l, i, j } of cubes) {
      const v = values[l][i][j];
      if (v > 0) {
        const mats = matsFor(v);
        mesh.material = mats;
      } else {
        mesh.material = matsFor(null); // bianco senza numero
      }
    }
  }

  // evidenzia errori (duplicati e zeri)
  function highlightErrors() {
    const dup = computeDuplicatesSet();
    for (const { mesh, l, i, j } of cubes) {
      const v = values[l][i][j];
      const isErr = (v === 0 && l > 0) || dup.has(v); // 0 ammesso solo layer 0 mentre si gioca; sotto è "da calcolare": se 0 ma calcolabile => già gestito dalla compute
      if (isErr) {
        // sovrascrivo i 6 materiali con rosso pieno
        mesh.material = [ERR_MAT, ERR_MAT, ERR_MAT, ERR_MAT, ERR_MAT, ERR_MAT];
      }
    }
    // palette: bordo rosso sui numeri duplicati
    document.querySelectorAll('#palette .chip').forEach(ch => {
      const n = parseInt(ch.dataset.n, 10);
      ch.classList.toggle('dup', dup.has(n));
    });
  }

  // rigenera la base (applica numeri che l’utente ha messo) + ricalcola tutto
  function repaintBaseFromTopRow() {
    // ricomputa dal top a scendere
    computeDifferences();
    repaintAll();
    highlightErrors();
    repaintStatus();
  }

  // status in alto (quante differenze uniche !=0 nel layer 1..4)
  function repaintStatus() {
    const st = document.getElementById('status');
    const uniques = new Set();
    for (let l = 1; l < LAYERS.length; l++) {
      const N = LAYERS[l];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const v = values[l][i][j];
        if (v > 0) uniques.add(v);
      }
    }
    st.innerHTML = `Differenze uniche: <b>${uniques.size}/10</b>`;
  }

  // ------- bottoni -------
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    buildPyramid();
    repaintAll();
    highlightErrors();
    repaintStatus();
  });

  document.getElementById('btn-shuffle')?.addEventListener('click', () => {
    // randomizza 5 slot frontali del primo layer
    const arr = [1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    for (let j = 0; j < 5; j++) values[0][0][j] = arr[j];
    repaintBaseFromTopRow();
  });

  // ------- avvio -------
  buildPalette();
  wirePalette();
  buildPyramid();
  repaintAll();
  highlightErrors();
  repaintStatus();

  // loop render
  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

})();
