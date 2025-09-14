// pyramid.js — Piramide 5x5,4x4,3x3,2x2,1x1 (numeri 1..15, differenze, duplicati)
// © tuo progetto

(function () {
  'use strict';

  // ---------- scena ----------
  var stage = document.getElementById('stage');
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  camera.position.set(0, 36, 58);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);

  function onResize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize, { passive: true }); onResize();

  scene.add(new THREE.AmbientLight(0xffffff, 1));
  var dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(12, 18, 14); scene.add(dir);

  // ---------- geometria ----------
  var STEP = 2.2, STEP_Y = 2.2, SIZE = 2.1;
  var GEO = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

  function addEdges(mesh) {
    var edges = new THREE.EdgesGeometry(GEO);
    var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    mesh.add(line);
  }

  function makeNumberCanvas(n) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    if (isFinite(n)) {
      g.fillStyle = '#000000';
      g.font = 'bold 180px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 128, 146);
    }
    return c;
  }
  function makeNumberTexture(n) {
    var tx = new THREE.CanvasTexture(makeNumberCanvas(n));
    tx.anisotropy = 4; tx.needsUpdate = true; return tx;
  }
  function matsFor(n) {
    var map = isFinite(n) ? makeNumberTexture(n) : null;
    var m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: map });
    return [m.clone(), m.clone(), m.clone(), m.clone(), m.clone(), m.clone()];
  }
  var ERR = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  // ---------- dati ----------
  var LAYERS = [5, 4, 3, 2, 1];           // top -> bottom
  var values = [];                        // values[l][i][j]   (0=vuoto)
  var computable = [];                    // true se i 2 genitori esistono
  var cubes = [];                         // {mesh,l,i,j}

  function posFor(l, i, j) {
    var N = LAYERS[l];
    var x = (i - (N - 1) / 2) * STEP;
    var z = (j - (N - 1) / 2) * STEP;
    var y = -l * STEP_Y;
    return new THREE.Vector3(x, y, z);
  }

  function buildPyramid() {
    for (var k = 0; k < cubes.length; k++) scene.remove(cubes[k].mesh);
    cubes.length = 0; values.length = 0; computable.length = 0;

    for (var l = 0; l < LAYERS.length; l++) {
      var N = LAYERS[l];
      values[l] = Array.from({ length: N }, function () { return Array(N).fill(0); });
      computable[l] = Array.from({ length: N }, function () { return Array(N).fill(false); });

      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        var mesh = new THREE.Mesh(GEO, matsFor(null));
        mesh.position.copy(posFor(l, i, j));
        addEdges(mesh);
        mesh.userData = { l: l, i: i, j: j };
        scene.add(mesh);
        cubes.push({ mesh: mesh, l: l, i: i, j: j });
      }
    }
  }

  // ---------- rotazione ----------
  (function () {
    var dragging = false, px = 0, py = 0, dom = renderer.domElement;
    dom.addEventListener('pointerdown', function (e) { dragging = true; px = e.clientX; py = e.clientY; });
    window.addEventListener('pointerup', function () { dragging = false; });
    window.addEventListener('pointercancel', function () { dragging = false; });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = (e.clientX - px) / 140, dy = (e.clientY - py) / 140;
      scene.rotation.y += dx; scene.rotation.x += dy;
      px = e.clientX; py = e.clientY;
    }, { passive: true });
  })();

  // ---------- palette ----------
  var paletteEl = document.getElementById('palette');
  if (!paletteEl) {
    var bar = document.querySelector('.bar');
    paletteEl = document.createElement('div');
    paletteEl.id = 'palette'; paletteEl.className = 'row';
    bar.insertBefore(paletteEl, bar.lastElementChild);
  }

  function buildPalette() {
    paletteEl.innerHTML = '';
    for (var n = 1; n <= 15; n++) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = String(n);
      chip.dataset.n = String(n);
      paletteEl.appendChild(chip);
    }
  }

  var selectedN = 1;
  function wirePalette() {
    paletteEl.addEventListener('click', function (e) {
      var el = e.target.closest('.chip'); if (!el) return;
      selectedN = parseInt(el.dataset.n, 10);
      Array.prototype.forEach.call(paletteEl.children, function (c) {
        c.classList.toggle('active', c === el);
      });
    });
    if (paletteEl.firstElementChild) paletteEl.firstElementChild.classList.add('active');
  }

  // ---------- picking ----------
  function pickFrontSlot(x, y) {
    var ray = new THREE.Raycaster();
    var ndc = new THREE.Vector2(
      (x / renderer.domElement.clientWidth) * 2 - 1,
      -(y / renderer.domElement.clientHeight) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);
    var hits = ray.intersectObjects(scene.children, true);
    for (var h = 0; h < hits.length; h++) {
      var o = hits[h].object;
      var ud = o.userData || (o.parent && o.parent.userData);
      if (!ud) continue;
      var l = ud.l, i = ud.i, j = ud.j;
      if (l === 0 && i === 0) return { l: l, i: i, j: j }; // fila frontale del layer 0
    }
    return null;
  }

  renderer.domElement.addEventListener('click', function (e) {
    var p = pickFrontSlot(e.clientX, e.clientY);
    if (!p) return;
    setValueAtFront(p.j, selectedN);
  });

  // ---------- logica ----------
  function setValueAtFront(col, v) {
    if (!(v >= 1 && v <= 15)) return; // 0 non ammesso
    values[0][0][col] = v;
    recomputeBelow();
  }

  function recomputeBelow() {
    for (var l = 1; l < LAYERS.length; l++) {
      var N = LAYERS[l];
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        var a = values[l - 1][i][j];
        var b = values[l - 1][i + 1][j];
        if (a > 0 && b > 0) {
          values[l][i][j] = Math.abs(a - b);
          computable[l][i][j] = true;
        } else {
          values[l][i][j] = 0;
          computable[l][i][j] = false;
        }
      }
    }
    repaint();
  }

  function computeDuplicatesSet() {
    var counts = Object.create(null);
    for (var l = 0; l < LAYERS.length; l++) {
      var N = LAYERS[l];
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        var v = values[l][i][j];
        if (!v) continue;
        counts[v] = (counts[v] || 0) + 1;
      }
    }
    var dup = new Set();
    Object.keys(counts).forEach(function (k) { if (counts[k] > 1) dup.add(parseInt(k, 10)); });
    return dup;
  }

  function repaintAllFacesNumber(mesh, n) {
    var mats = matsFor(isFinite(n) ? n : null);
    mesh.material = mats;
  }

  function repaint() {
    // numeri
    for (var k = 0; k < cubes.length; k++) {
      var c = cubes[k], v = values[c.l][c.i][c.j];
      repaintAllFacesNumber(c.mesh, v > 0 ? v : null);
    }

    // errori (duplicati + zeri calcolabili)
    var dup = computeDuplicatesSet();
    for (var k2 = 0; k2 < cubes.length; k2++) {
      var cu = cubes[k2], val = values[cu.l][cu.i][cu.j];
      var isZeroErr = (cu.l > 0 && computable[cu.l][cu.i][cu.j] && val === 0);
      var isDup = dup.has(val);
      if (isZeroErr || isDup) {
        cu.mesh.material = [ERR, ERR, ERR, ERR, ERR, ERR];
      }
    }

    // status
    var uniques = new Set();
    for (var l = 1; l < LAYERS.length; l++) {
      var N = LAYERS[l];
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        var vv = values[l][i][j]; if (vv > 0) uniques.add(vv);
      }
    }
    var st = document.getElementById('status');
    if (st) st.innerHTML = 'Differenze uniche: <b>' + uniques.size + '/10</b>';

    // palette duplicati (bordo rosso sui chip)
    var chips = document.querySelectorAll('#palette .chip');
    for (var t = 0; t < chips.length; t++) {
      var n = parseInt(chips[t].dataset.n, 10);
      chips[t].classList.toggle('dup', dup.has(n));
    }
  }

  // ---------- bottoni ----------
  var btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.addEventListener('click', function () {
    buildPyramid(); repaint();
  });

  var btnShuffle = document.getElementById('btn-shuffle');
  if (btnShuffle) btnShuffle.addEventListener('click', function () {
    // 5 numeri unici random per la fila frontale
    var pool = Array.from({ length: 15 }, function (_, i) { return i + 1; });
    for (var j = pool.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp;
    }
    for (var c = 0; c < 5; c++) values[0][0][c] = pool[c];
    recomputeBelow();
  });

  // ---------- start ----------
  buildPalette(); wirePalette();
  buildPyramid(); repaint();

  (function loop() {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

})();
