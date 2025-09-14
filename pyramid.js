(()=>{
'use strict';

/* =========================
   Configurazione generale
========================= */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(0, 10, 26);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci sobrie (numeri sono MeshBasicMaterial → sempre leggibili)
scene.add(new THREE.AmbientLight(0xffffff, .9));
const dir = new THREE.DirectionalLight(0xffffff, .4); dir.position.set(8,12,8);
scene.add(dir);

// adattamento viewport
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* =========================
   Geometrie/materiali
========================= */
const STEP = 2.4;     // distanza fra centri
const SIZE = 2.2;     // lato cubo
const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

// gradiente pastello coerente
function hsvToRgb(h,s,v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const baseColors = Array.from({length:15}, (_,i)=> {
  const h=(i/15)*.9, s=.55, v=.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|b;
});

// numero su canvas → texture
function makeNumberTexture(num, fg='#fff', bg='#ff4d4d'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(num),128,140);
  const tx = new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}

// materiale 6 facce uguali (numero su tutte le facce)
function matsForNumber(num, colorHex, isError=false){
  const bg = isError ? '#D3002D' : `#${colorHex.toString(16).padStart(6,'0')}`;
  const tx = makeNumberTexture(num, '#fff', bg);
  const mat = new THREE.MeshBasicMaterial({ map: tx });
  return [mat,mat,mat,mat,mat,mat];
}
// materiale “vuoto” (placeholder)
function matsEmpty(colorHex){
  const mat = new THREE.MeshLambertMaterial({ color: colorHex });
  return [mat,mat,mat,mat,mat,mat];
}

/* =========================
   Dati di gioco
========================= */
// Struttura a righe: 5,4,3,2,1 → indici (riga, colonna).
// Memorizziamo i valori calcolati/assegnati.
const rows = [5,4,3,2,1];
const values = rows.map(n => Array(n).fill(null)); // null = vuoto
// palette selezionata
let selectedNumber = null;

// Gruppi 3D per tenere in ordine i cubi
const root = new THREE.Group(); scene.add(root);

// mapping (r,c) → mesh + meta
const cells = []; // array di array: cells[r][c] = {mesh, baseColor, value}

/* =========================
   Posizionamento piramide
========================= */
function cellPosition(r,c){
  // r: 0..4 (0 = riga base con 5 cubi); c: 0..(rows[r]-1)
  const n = rows[r];
  const x = (c - (n-1)/2) * STEP;
  const y = -r * (SIZE*0.9);
  const z = 0;
  return new THREE.Vector3(x,y,z);
}

function buildPyramid(){
  // pulizia
  while(root.children.length) root.remove(root.children[0]);
  cells.length = 0;

  for(let r=0;r<rows.length;r++){
    const row = [];
    for(let c=0;c<rows[r];c++){
      const colorHex = (r===0 && c<5) ? baseColors[c] : 0xdfe6ef;
      const mesh = new THREE.Mesh(GEO, matsEmpty(colorHex));
      mesh.position.copy(cellPosition(r,c));
      mesh.userData = { r, c };
      root.add(mesh);
      row.push({ mesh, baseColor: colorHex, value: null });
    }
    cells.push(row);
  }
}
buildPyramid();

/* =========================
   Calcolo differenze & validazione
========================= */
function computeRowBelow(rowVals){
  const out = [];
  for(let i=0;i<rowVals.length-1;i++){
    const a=rowVals[i], b=rowVals[i+1];
    if(a==null || b==null){ out.push(null); continue; }
    out.push(Math.abs(a-b));
  }
  return out;
}
function recomputeUpwards(){
  // copia dalla base
  values[0] = cells[0].map(cell => cell.value);

  // calcola tutte le righe superiori
  for(let r=1;r<rows.length;r++){
    values[r] = computeRowBelow(values[r-1]);
  }
  // applica ai materiali + controlla duplicati
  paintAllWithValidation();
  updateStatus();
}
function updateStatus(){
  // le differenze coinvolte sono le 10 dei livelli 1..4
  const diffs = [];
  for(let r=1;r<rows.length;r++){
    for(let c=0;c<values[r].length;c++){
      const v = values[r][c];
      if(v!=null) diffs.push(v);
    }
  }
  const uniq = new Set(diffs.filter(v=>v!=null));
  const have = uniq.size;
  const tot = 10; // 4+3+2+1
  document.getElementById('status').innerHTML = `Differenze uniche: <b>${have}/${tot}</b>`;
}
function paintAllWithValidation(){
  // conta frequenze di TUTTI i numeri presenti (base + differenze)
  const freq = new Map();
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const v = values[r][c];
      if(v==null) continue;
      freq.set(v, (freq.get(v)||0)+1);
    }
  }
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const cell = cells[r][c];
      const v = values[r][c];
      if(v==null){
        cell.mesh.material = matsEmpty(cell.baseColor);
        continue;
      }
      const isDup = (freq.get(v)||0) > 1;
      cell.mesh.material = matsForNumber(v, cell.baseColor, isDup);
    }
  }
}

/* =========================
   Interazione
========================= */
// palette 1..15 (selezione)
const palette = document.getElementById('palette');
for(let n=1;n<=15;n++){
  const b=document.createElement('div'); b.className='chip'; b.textContent=n;
  b.addEventListener('click', ()=>{
    selectedNumber = n;
    [...palette.children].forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
  palette.appendChild(b);
}

// picking con raycaster
const ray = new THREE.Raycaster(), ndc=new THREE.Vector2();
function pickCell(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children,true);
  if(!hits.length) return null;
  let o = hits[0].object;
  while(o && !('r' in (o.userData||{}))) o = o.parent;
  return o ? cells[o.userData.r][o.userData.c] : null;
}

// set valore alla base (riga 0). Vietati duplicati 1..15.
function setValueAtBase(cIdx, val){
  if(val<1 || val>15 || !Number.isInteger(val)) return;
  // vieta duplicati 1..15 nella base
  for(let i=0;i<5;i++){
    if(i!==cIdx && cells[0][i].value === val) return; // ignora click se doppio
  }
  cells[0][cIdx].value = val;
  recomputeUpwards();
}

let dragging=false, px=0, py=0, rotX=root.rotation.x, rotY=root.rotation.y;

// pointer per rotazione + click per assegnare numero
renderer.domElement.addEventListener('pointerdown', e=>{
  dragging=true; px=e.clientX; py=e.clientY; rotX=root.rotation.x; rotY=root.rotation.y;
});
addEventListener('pointerup', e=>{
  if(!dragging) return;
  // click “quasi fermo” → prova ad assegnare
  const moved = (Math.hypot(e.clientX-px, e.clientY-py) > 4);
  dragging=false;
  if(!moved){
    const cell = pickCell(e.clientX, e.clientY);
    if(!cell) return;
    if(cell.mesh.userData.r !== 0) return;          // si può editare SOLO riga base
    if(selectedNumber==null) return;                 // serve un numero selezionato
    setValueAtBase(cell.mesh.userData.c, selectedNumber);
  }
});
addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/160, dy=(e.clientY-py)/160;
  root.rotation.y = rotY + dx;
  root.rotation.x = rotX + dy;
});

// doppio click per “iniziare”: centra, alza un filo e mostra palette attiva
let started=false;
stage.addEventListener('dblclick', ()=>{
  if(started) return;
  started=true;
  root.position.set(0,0,0);
  root.rotation.set(-0.25, 0.25, 0);
});

/* =========================
   Comandi UI
========================= */
document.getElementById('btn-reset').addEventListener('click', ()=>{
  // reset valori
  for(let c=0;c<5;c++) cells[0][c].value=null;
  recomputeUpwards();
  // reset selezione palette
  selectedNumber = null;
  [...palette.children].forEach(x=>x.classList.remove('active'));
});
document.getElementById('btn-scramble').addEventListener('click', ()=>{
  // 5 numeri casuali 1..15 senza ripetizioni
  const pool = [...Array(15)].map((_,i)=>i+1);
  for(let c=0;c<5;c++){
    const k = (Math.random()*pool.length)|0;
    cells[0][c].value = pool.splice(k,1)[0];
  }
  recomputeUpwards();
});

/* =========================
   Prima verniciata
========================= */
recomputeUpwards();

// loop di render
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
