(()=>{'use strict';

/* ---------- setup scena ---------- */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 18, 40);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.touchAction = 'none';
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(10,20,16); scene.add(dir);

function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const range = (n,off=0)=>Array.from({length:n},(_,i)=>i+off);
const $ = sel => document.querySelector(sel);

/* ---------- colori numeri ---------- */
function hsvToRgb(h, s, v){
  const f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0);
  return [f(5),f(3),f(1)].map(x=>Math.round(x*255));
}
const NUM_COL = id=>{
  const h=(id-1)/15, s=.60, v=.95;
  const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|b;
};

/* ---------- texture con numero su tutte le facce ---------- */
function makeNumberTexture(num, bgHex){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle = '#'+bgHex.toString(16).padStart(6,'0');
  g.fillRect(0,0,256,256);
  g.fillStyle = '#ffffff';
  g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText(String(num), 128, 138);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; t.needsUpdate=true;
  return t;
}
function matsFor(num){
  const color = NUM_COL(num);
  const tx = makeNumberTexture(num,color);
  const m = new THREE.MeshBasicMaterial({ map: tx });
  return [m,m,m,m,m,m];
}

/* ---------- parametri geometrici ---------- */
const GEO_SIZE = 3.2;
const GEO = new THREE.BoxGeometry(GEO_SIZE,GEO_SIZE,GEO_SIZE);

/* Vista “Matematica” (triangolo 5,4,3,2,1) */
const ROWS = [5,4,3,2,1];
const STEP_X = 3.6;
const STEP_Y = 3.6;

/* Vista “Strati 5×5→1” */
const LAYERS = [5,4,3,2,1];
const STEP = 3.4;

/* ---------- root ---------- */
const root = new THREE.Group();
scene.add(root);

/* ---------- STATO (vista “Matematica”) ---------- */
let topRow = [1,2,3,4,5];        // numeri 1..15
let cubes = [];                  // mesh attuali in scena
let currentView = 'math';        // 'math' | 'layers'

/* ---------- posizioni ---------- */
function posForMath(row, idx){
  const N = ROWS[row];
  const x = (idx - (N-1)/2) * STEP_X;
  const y = -row * STEP_Y;
  return new THREE.Vector3(x,y,0);
}
function posForLayer(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = -layerIdx * STEP; // punta verso il basso
  return new THREE.Vector3(x,y,z);
}

/* ---------- modello “Matematica” ---------- */
function computeRows(){
  const rows = [ topRow.slice() ];
  for(let r=1; r<ROWS.length; r++){
    const prev = rows[r-1];
    const cur = [];
    for(let i=0; i<prev.length-1; i++){
      cur.push( Math.abs(prev[i] - prev[i+1]) );
    }
    rows.push(cur);
  }
  return rows;
}

/* ---------- build & clear ---------- */
function clearRoot(){
  while(root.children.length) root.remove(root.children[0]);
  cubes.length = 0;
}
function buildMath(){
  clearRoot();
  const rows = computeRows();
  for(let r=0; r<ROWS.length; r++){
    for(let i=0; i<ROWS[r]; i++){
      const val = rows[r][i];
      const m = new THREE.Mesh(GEO, matsFor(val));
      m.position.copy(posForMath(r,i));
      m.userData = { mode:'math', row:r, col:i, value:val };
      root.add(m); cubes.push(m);
    }
  }
  updateStatus();
}
function buildLayers(){
  clearRoot();
  let colorIdx = 1;
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const value = (colorIdx-1)%15 + 1; // ciclo 1..15 per colorazione
        const m = new THREE.Mesh(GEO, matsFor(value));
        m.position.copy(posForLayer(l,i,j));
        m.userData = { mode:'layers', layer:l, i, j };
        root.add(m); cubes.push(m);
        colorIdx++;
      }
    }
  }
  // In questa vista la “status bar” non mostra le differenze
  $('#status').textContent = '—';
}

/* ---------- evidenzia duplicati (solo “Matematica”) ---------- */
function highlightMath(diffsFlat){
  const seen = new Map();
  diffsFlat.forEach((v,idx)=>{
    if(!seen.has(v)) seen.set(v, [idx]); else seen.get(v).push(idx);
  });
  const rBase = [0,0,4,7,9]; // indice base per riga 1..4 nelle 10 differenze
  cubes.forEach(mesh=>{
    if(mesh.userData.mode!=='math') return;
    if(mesh.userData.row===0){
      const tx = makeNumberTexture(mesh.userData.value, NUM_COL(mesh.userData.value));
      mesh.material.forEach(m=>{ m.map=tx; m.needsUpdate=true; });
      return;
    }
    const r = mesh.userData.row, i = mesh.userData.col;
    const linear = rBase[r] + i;
    const val = mesh.userData.value;
    const dup = seen.get(val) && seen.get(val).length>1;
    const bg = dup ? 0xff3b30 : NUM_COL(val);
    const tx = makeNumberTexture(val, bg);
    mesh.material.forEach(m=>{ m.map=tx; m.needsUpdate=true; });
  });
}
function updateStatus(){
  if(currentView!=='math'){ $('#status').textContent='—'; return; }
  const rows = computeRows();
  const diffs = rows.slice(1).flat();   // 10 valori
  const uniq  = new Set(diffs.filter(v=>Number.isFinite(v)));
  $('#status').textContent = `${uniq.size}/10`;
  highlightMath(diffs);
}

/* ---------- paletta 1..15 (solo “Matematica”) ---------- */
const palette = document.getElementById('palette');
let pendingNumber = null;
function buildPalette(){
  palette.textContent='';
  range(15,1).forEach(n=>{
    const d=document.createElement('div');
    d.className='pill';
    d.textContent=String(n);
    d.style.background = '#fff';
    d.style.color = '#000';
    d.style.borderColor = '#'+NUM_COL(n).toString(16).padStart(6,'0');
    d.addEventListener('click', ()=>{
      pendingNumber = (pendingNumber===n)? null : n;
      [...palette.children].forEach(el=>el.classList.remove('active'));
      if(pendingNumber!=null) d.classList.add('active');
    });
    palette.appendChild(d);
  });
}

/* ---------- picking / edit (solo “Matematica”) ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickTopAt(clientX, clientY){
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX-rect.left)/rect.width)*2-1;
  ndc.y = -((clientY-rect.top)/rect.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children, false);
  for(const h of hits){
    const o=h.object, ud=o.userData;
    if(ud && ud.mode==='math' && ud.row===0) return o;
  }
  return null;
}
renderer.domElement.addEventListener('click', e=>{
  if(currentView!=='math') return;
  const hit = pickTopAt(e.clientX, e.clientY);
  if(hit){
    let v = pendingNumber;
    if(v==null){
      const s = prompt('Numero (1..15) per la posizione '+(hit.userData.col+1), topRow[hit.userData.col]);
      if(s==null) return;
      v = parseInt(s,10);
    }
    if(!Number.isFinite(v) || v<1 || v>15) { alert('Inserisci un intero tra 1 e 15'); return; }
    topRow[hit.userData.col] = v;
    buildMath();
  }
});

/* ---------- orbit (mouse + touch iPhone) ---------- */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  dragging=true; px=e.clientX; py=e.clientY; renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', e=>{
  dragging=false; renderer.domElement.releasePointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  root.rotation.y += dx; root.rotation.x = clamp(root.rotation.x+dy, -1.2, 1.2);
  px=e.clientX; py=e.clientY;
});

/* ---------- controlli UI ---------- */
document.getElementById('btn-reset').addEventListener('click', ()=>{
  root.rotation.set(0,0,0);
  if(currentView==='math'){
    topRow = [1,2,3,4,5];
    pendingNumber = null;
    [...palette.children].forEach(el=>el.classList.remove('active'));
    buildMath();
  }else{
    buildLayers();
  }
});
document.getElementById('btn-shuffle').addEventListener('click', ()=>{
  if(currentView!=='math') return;
  const bag = range(15,1);
  for(let i=bag.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [bag[i],bag[j]]=[bag[j],bag[i]]; }
  topRow = bag.slice(0,5);
  pendingNumber = null;
  [...palette.children].forEach(el=>el.classList.remove('active'));
  buildMath();
});
document.getElementById('view').addEventListener('change', e=>{
  currentView = e.target.value;        // 'math' | 'layers'
  document.body.classList.toggle('hidePalette', currentView!=='math');
  if(currentView==='math'){ buildMath(); }
  else { buildLayers(); }
});

/* ---------- avvio ---------- */
buildPalette();
buildMath();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
