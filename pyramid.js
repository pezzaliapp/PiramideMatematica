(()=>{'use strict';

/* =========================================================
   Piramide Matematica 3D
   — livelli: 5x5, 4x4, 3x3, 2x2, 1x1 (base in alto, punta in basso)
   — 5 numeri in cima (top5) → differenze assolute fino alla punta
   — ogni cubo mostra lo stesso numero su tutte le facce
   — evidenziazione rossa quando una differenza è 0 o compare più volte
   — “Mescola 5” e “Reset”
   ========================================================= */

const $ = (sel)=>document.querySelector(sel);
const stage  = $('#stage');
const btnShuffle = $('#btn-shuffle');
const btnReset   = $('#btn-reset');
const statusEl   = $('#status');

// ---------- Three.js base ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 30, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci (irrilevanti per MeshBasicMaterial, ma lasciamo ambient per eventuali futuri abbellimenti)
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.4);
dir.position.set(10,20,14); scene.add(dir);

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  renderer.render(scene,camera);
}
window.addEventListener('resize', onResize, {passive:true});
onResize();

// ---------- parametri piramide ----------
const LAYERS = [5,4,3,2,1];  // 5x5 → 1x1
const STEP   = 2.2;          // passo griglia X/Z
const STEP_Y = 2.2;          // distanza verticale layer
const SIZE   = 2.18;         // lato cubo (quasi STEP per “blocchi uniti”)
const GEO    = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

// palette: 5 colori per le 5 “colonne” (si ripetono per j)
const COLS = [0x2d8cff, 0x2ec27e, 0xfad643, 0xff7b2f, 0xdb3a34];

// ---------- numeri & texture su tutte le facce ----------
const TEX_CACHE = new Map(); // `${num}-${colorHex}` o `${num}-${colorHex}-bad` → CanvasTexture

function numberTextureAllFaces(num, colorHex){
  const key = `${num}-${colorHex}`;
  const cached = TEX_CACHE.get(key);
  if (cached) return cached;

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');

  // sfondo = coloreHex
  const r = (colorHex>>16)&255, gC=(colorHex>>8)&255, b=colorHex&255;
  g.fillStyle = `rgb(${r},${gC},${b})`;
  g.fillRect(0,0,256,256);

  // numero (ombra + bianco)
  g.font = 'bold 172px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  g.fillStyle = 'rgba(0,0,0,0.25)'; // ombra
  g.fillText(String(num ?? ''), 132, 156);
  g.fillStyle = '#ffffff';
  g.fillText(String(num ?? ''), 128, 152);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  TEX_CACHE.set(key, tex);
  return tex;
}

function numberTextureAllFacesWithBorder(num, colorHex){
  const key = `${num}-${colorHex}-bad`;
  const cached = TEX_CACHE.get(key);
  if (cached) return cached;

  const base = numberTextureAllFaces(num, colorHex);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.drawImage(base.image, 0, 0);

  // bordo rosso di evidenziazione
  g.lineWidth = 12; g.strokeStyle = '#c0392b';
  g.strokeRect(6, 6, 244, 244);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4; tex.needsUpdate = true;
  TEX_CACHE.set(key, tex);
  return tex;
}

// 6 facce con la stessa texture (numero + colore)
function matsFor(value, colorHex){
  const t = numberTextureAllFaces(value, colorHex);
  const m = new THREE.MeshBasicMaterial({ map: t });
  return [m.clone(), m.clone(), m.clone(), m.clone(), m.clone(), m.clone()];
}

// ---------- posizionamento ----------
function posFor(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layerIdx * STEP_Y;  // base in alto (y=0), giù verso la punta
  return new THREE.Vector3(x,y,z);
}

// ---------- stato numerico (top5 → differenze) ----------
let top5 = [1,2,3,4,5];                 // valori iniziali
const rows = Array.from({length:5},(_,i)=>Array(LAYERS[i]).fill(0));

function computeRows(){
  rows[0] = top5.slice(); // 5
  for (let l=1; l<LAYERS.length; l++){
    const prev = rows[l-1];
    const cur  = rows[l];
    for (let i=0; i<cur.length; i++){
      cur[i] = Math.abs(prev[i] - prev[i+1]);
    }
  }
}

// ---------- costruzione piramide ----------
const cubes = []; // {mesh, mats[], layer, i, j}

function buildScene(){
  // pulizia
  while(scene.children.find(o=>o.isMesh)) {
    const idx = scene.children.findIndex(o=>o.isMesh);
    scene.remove(scene.children[idx]);
  }
  cubes.length = 0;

  for (let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for (let i=0; i<N; i++){
      for (let j=0; j<N; j++){
        const val  = rows[l][i];                // stesso valore per tutti i j della colonna i
        const col  = COLS[i % COLS.length];
        const mats = matsFor(val, col);
        const mesh = new THREE.Mesh(GEO, mats);
        mesh.position.copy(posFor(l, i, j));
        scene.add(mesh);
        cubes.push({ mesh, mats, layer:l, i, j });
      }
    }
  }
}

// ---------- repaint + highlight ----------
function setStatus(unique){
  statusEl.innerHTML = `Differenze uniche: <b>${unique}/10</b>`;
}

function checkUniqueAndHighlight(){
  // differenze = righe 1..4 (4 + 3 + 2 + 1 = 10)
  const diffs = rows[1].concat(rows[2], rows[3], rows[4]);
  const freq = {};
  diffs.forEach(v => { freq[v] = (freq[v]||0)+1; });

  const badSet = new Set();
  diffs.forEach(v => { if (v === 0 || freq[v] > 1) badSet.add(v); });

  const uniqueCount = new Set(diffs.filter(v => v > 0)).size;
  setStatus(uniqueCount);

  // aggiorna texture per ogni cubo in base allo stato
  for (const c of cubes){
    const v   = rows[c.layer][c.i];
    const col = COLS[c.i % COLS.length];
    const tex = badSet.has(v) ? numberTextureAllFacesWithBorder(v, col)
                              : numberTextureAllFaces(v, col);
    for (let f=0; f<6; f++){
      if (c.mats[f].map !== tex){
        c.mats[f].map = tex;
        c.mats[f].needsUpdate = true;
      }
    }
  }
}

function repaint(){
  computeRows();
  // i cubi sono già creati: basta aggiornare le texture
  checkUniqueAndHighlight();
}

// ---------- interazione ----------
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', (e)=>{ dragging=true; px=e.clientX; py=e.clientY; });
window.addEventListener('pointerup', ()=> dragging=false);
window.addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px=e.clientX; py=e.clientY;
});

// Click sulle 5 colonne del layer superiore per inserire numeri 1..15
renderer.domElement.addEventListener('click', (e)=>{
  // raycast solo per il layer 0 (5x5)
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX-rect.left)/rect.width)*2-1,
    -((e.clientY-rect.top)/rect.height)*2+1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(scene.children, true);
  if(!hits.length) return;

  // risaliamo al mesh del cubo
  let obj = hits[0].object;
  while(obj && !obj.isMesh) obj = obj.parent;
  if(!obj) return;

  // trova il record del cubo
  const rec = cubes.find(c => c.mesh === obj);
  if(!rec) return;
  if(rec.layer !== 0) return; // edit solo in top5

  const colIndex = rec.i; // 0..4
  const cur = top5[colIndex];
  let v = window.prompt(`Numero (1..15) per la colonna ${colIndex+1}:`, String(cur));
  if(v == null) return;
  v = parseInt(v, 10);
  if(!Number.isFinite(v) || v < 1 || v > 15){ alert('Inserisci un intero tra 1 e 15.'); return; }
  top5[colIndex] = v;
  repaint();
});

// ---------- pulsanti ----------
btnShuffle?.addEventListener('click', ()=>{
  // estrai 5 numeri distinti da 1..15
  const pool = Array.from({length:15},(_,i)=>i+1);
  for (let i=pool.length-1; i>0; i--) {
    const j = Math.floor(Math.random()* (i+1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  top5 = pool.slice(0,5);
  repaint();
});

btnReset?.addEventListener('click', ()=>{
  top5 = [1,2,3,4,5];
  scene.rotation.set(0,0,0);
  repaint();
});

// ---------- avvio ----------
computeRows();
buildScene();
repaint();

(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})(); 
