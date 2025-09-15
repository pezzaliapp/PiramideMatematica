(()=>{'use strict';

/* ===================  SCENA  =================== */
const rootBG = '#ffffff';          // sfondo pagina (bianco)
const edgeColor = 0x111111;        // bordi neri
document.body.style.background = rootBG;

const stage = document.getElementById('stage');

const scene = new THREE.Scene();
scene.background = new THREE.Color(rootBG);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(0, 26, 46);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(10, 20, 14);
scene.add(dir);

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener('resize', onResize, {passive:true});
onResize();

/* ===================  COSTANTI  =================== */
const LAYERS = [5,4,3,2,1];  // 5×5 → 1×1
const STEP = 2.2;            // spaziatura X/Z
const STEP_Y = 2.2;          // spaziatura verticale
const SIZE = 2.02;           // lato del cubo
const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

const WHITE = 0xffffff;

/* ===================  TEXTURE NUMERI  =================== */
// cache di texture per 0..15 (0 = errore, sarà rosso)
const texCache = new Map();
function makeNumberCanvas(n, fill='#000', bg='#fff'){
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0,0,256,256);
  g.fillStyle = fill;
  g.font = 'bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 128, 142);
  return c;
}
function numberTexture(n, isError=false){
  const key = `${n}|${isError?'err':'ok'}`;
  if (texCache.has(key)) return texCache.get(key);
  const bg = '#fff';
  const fg = isError ? '#ff3030' : '#000';
  const tx = new THREE.CanvasTexture(makeNumberCanvas(n, fg, bg));
  tx.anisotropy = 4; tx.needsUpdate = true;
  texCache.set(key, tx);
  return tx;
}

/* ===================  MATERIALI  =================== */
function matsFor(n, error=false){
  const map = numberTexture(n, error);
  // MeshBasicMaterial per non far influenzare i numeri dalle luci
  const numbered = new THREE.MeshBasicMaterial({ map, transparent:false });
  // stesso materiale su tutte le 6 facce
  return [numbered, numbered, numbered, numbered, numbered, numbered];
}
const whiteLambert = new THREE.MeshLambertMaterial({ color: WHITE });

/* ===================  POSIZIONAMENTO  =================== */
function centerCoord(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = -layerIdx * STEP_Y; // base in alto → punta in basso
  return new THREE.Vector3(x,y,z);
}

/* ===================  COSTRUZIONE PIRAMIDE  =================== */
const cells = []; // { mesh, edges, layer, i, j, value }
function buildPyramid(){
  // pulizia
  while(scene.children.length){
    const obj = scene.children.pop();
    // preserva camera/luci/renderer attachments
    if (obj.isCamera || obj.isLight) { scene.children.push(obj); break; }
  }

  // rimetti luci
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));

  cells.length = 0;

  for (let L=0; L<LAYERS.length; L++){
    const N = LAYERS[L];
    for (let i=0; i<N; i++){
      for (let j=0; j<N; j++){
        // cubo bianco
        const mesh = new THREE.Mesh(GEO, matsFor(' ', false));
        mesh.material = [whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert];
        mesh.position.copy(centerCoord(L, i, j));
        mesh.userData = { layer:L, i, j, value:null };
        scene.add(mesh);

        // bordi neri
        const eg = new THREE.EdgesGeometry(GEO);
        const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor }));
        edges.position.copy(mesh.position);
        scene.add(edges);

        cells.push({ mesh, edges, layer:L, i, j, value:null, error:false });
      }
    }
  }
}
buildPyramid();

/* ===================  MODELLO DEL GIOCO  =================== */
// matrice dei valori per ogni layer (replichiamo dietro solo per estetica)
const values = LAYERS.map(N => Array.from({length:N}, ()=>Array(N).fill(null)));

// riga frontale del top layer (j==0)
// i ∈ [0..4]
function setTopFront(i, n){
  // assegna numero alla casella [top, i, 0]
  const L = 0, jFront = 0;
  values[L][i][jFront] = n;

  // **replica estetica** sui cubi dietro nella stessa colonna del 5×5
  for (let j=1; j<LAYERS[0]; j++){
    values[L][i][j] = n;
  }
  // ricalcola tutte le differenze discendenti
  recomputeDifferences();
  repaintAll();
}

/* Calcolo differenze assolute discendenti.
   r0: 5 numeri (fila frontale top) → r1: 4 → r2: 3 → r3: 2 → r4: 1 */
function recomputeDifferences(){
  // prendi i 5 numeri frontali (se non tutti presenti, computa per quanto possibile)
  const top = [];
  for (let i=0; i<5; i++){
    const v = values[0][i][0];
    top.push(v==null ? null : v);
  }

  // cancella le righe inferiori
  for (let L=1; L<LAYERS.length; L++){
    const N = LAYERS[L];
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) values[L][i][j] = null;
  }

  // se almeno 2 consecutivi sono definiti, inizia la cascata
  let prevRow = top;
  for (let L=1; L<LAYERS.length; L++){
    const N = LAYERS[L];
    const next = Array(N).fill(null);
    for (let i=0; i<N; i++){
      const a = prevRow[i], b = prevRow[i+1];
      if (a!=null && b!=null){
        const diff = Math.abs(a - b); // 0 è *non ammesso*, verrà evidenziato
        next[i] = diff;
        // replica estetica su profondità di questo layer
        for (let j=0; j<N; j++){
          values[L][i][j] = diff;
        }
      }
    }
    prevRow = next;
  }
}

/* ===================  MATERIALE NUMERI / ERRORI  =================== */
function applyNumberOnAllFaces(cell, n, isError){
  if (n==null){
    // torna “bianco puro”
    cell.mesh.material = [whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert];
    return;
  }
  const mats = matsFor(n, !!isError);
  cell.mesh.material = mats;
}

/* Evidenzia duplicati (e zeri) in tutta la piramide */
function highlightDuplicates(){
  // reset flag errore
  for (const c of cells) c.error = false;

  // raccogli tutti i valori “attivi”
  const list = [];
  for (const c of cells){
    const n = values[c.layer][c.i][c.j];
    if (n!=null) list.push({cell:c, n});
  }

  // conta occorrenze (1..15) + zeri
  const count = new Map();   // n -> occorrenze
  for (const it of list){
    const k = it.n;
    count.set(k, (count.get(k)||0)+1);
  }

  // marca come errore: duplicati (count>1) e zeri (n===0)
  for (const it of list){
    if (it.n===0 || (count.get(it.n)>1)){
      it.cell.error = true;
    }
  }
}

/* ===================  RENDER UI  =================== */
function repaintAll(){
  // aggiorna mesh materiali
  for (const c of cells){
    const n = values[c.layer][c.i][c.j];
    applyNumberOnAllFaces(c, n, c.error);
  }
  // “Differenze uniche” = numero di layer con tutte le celle definite (max 10).
  const statusEl = document.getElementById('status');
  if (statusEl){
    let uniq = 0;
    for (let L=1; L<LAYERS.length; L++){
      const N = LAYERS[L];
      let full = true;
      for (let i=0;i<N;i++){ if (values[L][i][0]==null){ full=false; break; } }
      if (full) uniq++;
    }
    statusEl.innerHTML = `Differenze uniche: <b>${uniq}/10</b>`;
  }
}

/* ===================  PALETTE  =================== */
const paletteRow = document.getElementById('palette');
(function buildPalette(){
  if (!paletteRow) return;
  for (let n=1; n<=15; n++){
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = n;
    chip.style.minWidth = chip.style.height = '34px';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = chip.style.justifyContent = 'center';
    chip.style.border = '2px solid #fff';
    chip.style.background = '#fff';
    chip.style.color = '#000';
    chip.style.fontWeight = '800';
    chip.style.borderRadius = '999px';
    chip.style.cursor = 'pointer';
    chip.style.userSelect = 'none';
    paletteRow.appendChild(chip);
  }
})();

let selectedValue = null;
paletteRow?.addEventListener('click', (ev)=>{
  const chip = ev.target.closest('.chip');
  if (!chip) return;
  selectedValue = parseInt(chip.textContent, 10);
  // evidenzia selezione
  paletteRow.querySelectorAll('.chip').forEach(c=>c.style.boxShadow='none');
  chip.style.boxShadow = '0 0 0 3px rgba(0,0,0,.2)';
});

/* ===================  INTERAZIONE CANVAS  =================== */
// picking: ritorna la cella *frontale* del top layer se cliccata
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function pickFrontSlot(clientX, clientY){
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const meshes = cells.map(c=>c.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  for (const h of hits){
    const o = h.object;
    const {layer, i, j} = o.userData || {};
    if (layer===0 && j===0) {
      return cells.find(c=>c.layer===0 && c.i===i && c.j===0) || null;
    }
  }
  return null;
}

function onClickCanvas(ev){
  // assegna solo se ho selezionato un numero
  if (selectedValue==null) return;
  const pick = pickFrontSlot(ev.clientX, ev.clientY);
  if (!pick) return;

  // assegna valore (1..15) allo slot frontale e replica dietro
  const n = selectedValue;
  if (!(Number.isInteger(n) && n>=1 && n<=15)) return;

  setTopFront(pick.i, n);

  // evidenzia errori su tutta la piramide
  highlightDuplicates();
  repaintAll();
}

renderer.domElement.addEventListener('click', onClickCanvas);

/* Drag per ruotare: sfondo soltanto (evito di rubare click ai cubi) */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', (e)=>{
  dragging = true; px = e.clientX; py = e.clientY;
}, {passive:true});
addEventListener('pointerup', ()=> dragging=false, {passive:true});
addEventListener('pointermove', (e)=>{
  if (!dragging) return;
  // se il puntatore è sul canvas ma NON sui cubi, ruota
  const pick = pickFrontSlot(e.clientX, e.clientY);
  if (pick) return; // sto sopra ai cubi: non ruotare
  const dx = (e.clientX - px) / 140, dy = (e.clientY - py) / 140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px = e.clientX; py = e.clientY;
}, {passive:true});

/* ===================  BOTTONI  =================== */
document.getElementById('btn-reset')?.addEventListener('click', ()=>{
  // reset modello
  for (let L=0; L<LAYERS.length; L++){
    const N = LAYERS[L];
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) values[L][i][j]=null;
  }
  for (const c of cells){ c.error=false; }
  selectedValue=null;
  paletteRow?.querySelectorAll('.chip').forEach(c=>c.style.boxShadow='none');
  recomputeDifferences();
  highlightDuplicates();
  repaintAll();
});

document.getElementById('btn-shuffle')?.addEventListener('click', ()=>{
  // randomizza 5 slot frontali (1..15 non ordinati)
  const arr = Array.from({length:15}, (_,k)=>k+1).sort(()=>Math.random()-0.5).slice(0,5);
  for (let i=0; i<5; i++) setTopFront(i, arr[i]);
  highlightDuplicates();
  repaintAll();
});

/* ===================  AVVIO  =================== */
function loop(){
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
recomputeDifferences();
highlightDuplicates();
repaintAll();
loop();

})();
