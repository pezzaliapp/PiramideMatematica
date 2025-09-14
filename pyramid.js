(()=>{'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // sfondo bianco

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.display = 'block';
renderer.domElement.style.touchAction = 'none';
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff, .9));
const dir = new THREE.DirectionalLight(0xffffff, .45);
dir.position.set(10,20,14);
scene.add(dir);

// Resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.render(scene,camera);
}
addEventListener('resize', onResize, {passive:true});
onResize();

// ─────────────────────────────────────────────────────────────────────────────
// Geometria piramide 5,4,3,2,1 (base in alto)
// ─────────────────────────────────────────────────────────────────────────────
const LAYERS = [5,4,3,2,1];     // base (in alto) -> punta (in basso)
const STEP   = 2.20;            // distanza tra centri X/Z
const STEP_Y = 2.20;            // distanza verticale
const SIZE   = 2.18;            // lato del cubo (≈ STEP → piramide "unita")
const GEO    = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

function positionFor(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layerIdx * STEP_Y;
  return new THREE.Vector3(x,y,z);
}

// ─────────────────────────────────────────────────────────────────────────────
/*  Texture numeriche su tutte le facce
    - sfondo bianco
    - numero nero
    - stesso su tutte e 6 le facce                                         */
// ─────────────────────────────────────────────────────────────────────────────
const numberTexCache = new Map();
function makeNumberTexture(num){
  const key = String(num);
  if(numberTexCache.has(key)) return numberTexCache.get(key);

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');

  // sfondo bianco
  g.fillStyle = '#ffffff';
  g.fillRect(0,0,256,256);

  // numero nero
  g.fillStyle = '#111111';
  g.font = 'bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.08)';
  g.shadowBlur  = 4;
  g.fillText(String(num), 128, 140);

  const tx = new THREE.CanvasTexture(c);
  tx.anisotropy = 4;
  tx.needsUpdate = true;
  numberTexCache.set(key, tx);
  return tx;
}
function matsForNumber(num){
  const map = makeNumberTexture(num);
  return [0,1,2,3,4,5].map(()=> new THREE.MeshBasicMaterial({ map }));
}

// materiale “vuoto” (cubo bianco senza numero)
const MAT_EMPTY = new Array(6).fill(
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);

// ─────────────────────────────────────────────────────────────────────────────
// Costruzione piramide
// ─────────────────────────────────────────────────────────────────────────────
const cubes = [];           // { mesh, layer, i, j, value, edgeMat }
const byKey = new Map();    // "l:i:j" -> record
const group = new THREE.Group();
scene.add(group);

function keyOf(l,i,j){ return `${l}:${i}:${j}`; }

function buildPyramid(){
  while(group.children.length) group.remove(group.children[0]);
  cubes.length = 0; byKey.clear();

  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0; i<N; i++){
      for(let j=0; j<N; j++){
        const mesh = new THREE.Mesh(GEO, MAT_EMPTY.map(m=>m.clone()));
        mesh.position.copy(positionFor(l,i,j));

        // contorno nero SEMPRE visibile (diventerà rosso sui duplicati)
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(GEO), edgeMat);
        mesh.add(edges);

        group.add(mesh);
        const rec = { mesh, layer:l, i, j, value:null, edgeMat };
        cubes.push(rec);
        byKey.set(keyOf(l,i,j), rec);
      }
    }
  }
}
buildPyramid();

// mappo la “colonna” frontale: 5 → 4 → 3 → 2 → 1
const frontRows = [];
(function mapFront(){
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    const j = N-1;                    // faccia frontale
    const row = [];
    for(let i=0; i<N; i++) row.push(byKey.get(keyOf(l,i,j)));
    frontRows.push(row);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Interazione scena (rotazione)
// ─────────────────────────────────────────────────────────────────────────────
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e => { dragging=true; px=e.clientX; py=e.clientY; });
addEventListener('pointerup', ()=> dragging=false, {passive:true});
addEventListener('pointermove', e => {
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  group.rotation.y += dx;
  group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy));
  px=e.clientX; py=e.clientY;
});

// ─────────────────────────────────────────────────────────────────────────────
// Palette 1..15
// ─────────────────────────────────────────────────────────────────────────────
const paletteEl = document.getElementById('palette');
let currentNumber = 1;

function buildPalette(){
  for(let n=1;n<=15;n++){
    const b = document.createElement('div');
    b.className = 'chip';
    b.textContent = n;
    if(n===currentNumber) b.classList.add('active');
    b.addEventListener('click', ()=>{
      currentNumber = n;
      for(const c of paletteEl.children) c.classList.remove('active');
      b.classList.add('active');
    });
    paletteEl.appendChild(b);
  }
}
buildPalette();

function repaint(){ renderer.render(scene,camera); }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left)/r.width)*2 - 1;
  ndc.y = -((clientY - r.top)/r.height)*2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(group.children, true);
  if(!hits.length) return null;
  let o = hits[0].object;
  while(o && o.parent && o.parent!==group) o = o.parent;
  return o;
}

function setValue(rec, num){
  rec.value = num;
  rec.mesh.material = matsForNumber(num);
}

function clearValue(rec){
  rec.value = null;
  rec.mesh.material = MAT_EMPTY.map(m=>m.clone());
}

// ─────────────────────────────────────────────────────────────────────────────
// Input: SOLO sulla riga frontale superiore (5 cubi).
// Ogni inserimento aggiorna le differenze assolute sotto.
// ─────────────────────────────────────────────────────────────────────────────
renderer.domElement.addEventListener('click', e=>{
  const m = pickAt(e.clientX, e.clientY);
  if(!m) return;
  const rec = cubes.find(c => c.mesh===m);
  if(!rec) return;

  const isTopFront = frontRows[0].includes(rec);
  if(!isTopFront) return; // si inserisce solo in cima (5 cubi)

  setValue(rec, currentNumber);
  recomputeBelow();
  checkDuplicatesAndStatus();
  repaint();
});

// ─────────────────────────────────────────────────────────────────────────────
// Matematica: differenze assolute (row r = |row r-1[i] - row r-1[i+1]|)
// ─────────────────────────────────────────────────────────────────────────────
function recomputeBelow(){
  // se la top row è tutta vuota → svuota tutto sotto
  const top = frontRows[0];
  const anyTop = top.some(r => r.value!=null);
  if(!anyTop){
    for(let r=1;r<frontRows.length;r++) for(const cell of frontRows[r]) clearValue(cell);
    return;
  }

  for(let r=1; r<frontRows.length; r++){
    const prev = frontRows[r-1];
    const cur  = frontRows[r];
    for(let i=0;i<cur.length;i++){
      const a = prev[i]?.value, b = prev[i+1]?.value;
      if(a==null || b==null){
        clearValue(cur[i]);
      }else{
        setValue(cur[i], Math.abs(a-b));
      }
    }
  }
}

function checkDuplicatesAndStatus(){
  const all = [];
  for(const row of frontRows) for(const cell of row) if(cell.value!=null) all.push(cell);

  // differenze (le 10 celle sotto la prima riga)
  const diffs = [];
  for(let r=1;r<frontRows.length;r++) for(const cell of frontRows[r]) if(cell.value!=null) diffs.push(cell.value);
  const uniqueDiffs = new Set(diffs).size;
  document.getElementById('status').innerHTML = `Differenze uniche: <b>${uniqueDiffs}/10</b>`;

  // duplicati su TUTTI i numeri: bordo rosso sui numeri ripetuti, nero sugli altri
  const freq = new Map();
  for(const c of all) freq.set(c.value, (freq.get(c.value)||0)+1);
  for(const row of frontRows){
    for(const cell of row){
      if(cell.value==null){ cell.edgeMat.color.set(0x000000); continue; }
      const dup = freq.get(cell.value)>1;
      cell.edgeMat.color.set(dup ? 0xff3344 : 0x000000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shuffle e Reset
// ─────────────────────────────────────────────────────────────────────────────
function shuffleTop(){
  const nums = Array.from({length:15},(_,i)=>i+1);
  for(let i=nums.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [nums[i],nums[j]]=[nums[j],nums[i]]; }
  const top5 = nums.slice(0,5);

  const top = frontRows[0];
  for(let i=0;i<top.length;i++) setValue(top[i], top5[i]);
  recomputeBelow();
  checkDuplicatesAndStatus();
  repaint();
}

function resetAll(){
  for(const c of cubes){ clearValue(c); c.edgeMat.color.set(0x000000); }
  group.rotation.set(0,0,0);
  document.getElementById('status').innerHTML = 'Differenze uniche: <b>0/10</b>';
  repaint();
}

document.getElementById('btn-shuffle').addEventListener('click', shuffleTop);
document.getElementById('btn-reset').addEventListener('click', resetAll);

// ─────────────────────────────────────────────────────────────────────────────
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
