(()=>{'use strict';

// ---------- Scena base ----------
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 30, 55);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.touchAction = 'none';   // iPhone: abilita drag nativo pointer
stage.appendChild(renderer.domElement);

// Luci (neutre, per non sporcare i numeri)
scene.add(new THREE.AmbientLight(0xffffff, 1));
const key = new THREE.DirectionalLight(0xffffff, 0.3);
key.position.set(10,20,14); scene.add(key);

// Resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
window.addEventListener('resize', onResize, {passive:true}); onResize();

// ---------- Geometria / materiali ----------
const STEP = 2.4;
const STEP_Y = 2.4;
const SIZE = 2.3;
const GEO = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

// texture numerica (canvas) – usata su TUTTE le facce
function makeNumberTexture(num, bg){
  const c = document.createElement('canvas'); c.width=c.height=256;
  const g = c.getContext('2d');
  // sfondo
  g.fillStyle = bg; g.fillRect(0,0,256,256);
  // numero
  g.fillStyle = '#ffffff';
  g.font = 'bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(num, 128, 144);
  const tx = new THREE.CanvasTexture(c);
  tx.anisotropy = 4; tx.needsUpdate = true;
  return tx;
}

// palette colori morbida (15 colori)
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const FACE_COLORS = Array.from({length:15},(_,i)=> {
  const h=i/15, s=0.55, v=0.85; const [r,g,b]=hsvToRgb(h,s,v);
  return `rgb(${r},${g},${b})`;
});

// materiale 6 facce con NUMERO
function matsFor(num){
  const bg = FACE_COLORS[(num-1)%15];
  const tx = makeNumberTexture(num, bg);
  const m = new THREE.MeshBasicMaterial({ map: tx });
  // 6 facce identiche col numero
  return [m,m,m,m,m,m];
}

// ---------- Vista “Strati 5×5 → 1×1” ----------
const LAYERS = [5,4,3,2,1];
const cubes = [];
const root = new THREE.Group(); scene.add(root);

function clearRoot(){
  while(root.children.length) root.remove(root.children[0]);
  cubes.length = 0;
}

function posForLayer(layerIdx,i,j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = -layerIdx * STEP_Y;
  return new THREE.Vector3(x,y,z);
}

function buildLayers(){
  clearRoot();
  // numeri 1..15 ripetuti ciclicamente per riempire tutti i cubi della piramide
  let k = 1;
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const val = ((k-1)%15)+1;
        const mesh = new THREE.Mesh(GEO, matsFor(val));
        mesh.position.copy(posForLayer(l,i,j));
        mesh.userData = { mode:'layers', layer:l, i, j, value:val };
        root.add(mesh); cubes.push(mesh);
        k++;
      }
    }
  }
  setStatus('—');
}

// ---------- Vista “Matematica” (riga alta 5 cubi, differenze uniche) ----------
const TOP5 = [1,2,3,4,5];  // default visivo richiesto
function posForMath(row, col){ // row 0..4 (5,4,3,2,1), col 0..rowLen-1, punta in basso
  const sizes=[5,4,3,2,1];
  const N = sizes[row];
  const x = (col - (N-1)/2) * STEP;
  const y = -row * STEP_Y;
  const z = 0;
  return new THREE.Vector3(x,y,z);
}
function buildMath(){
  clearRoot();
  // riga alta = TOP5, le altre righe = differenze (mostrate)
  const rows = [TOP5.slice()];
  for(let r=1;r<5;r++){
    const prev = rows[r-1];
    const cur = [];
    for(let i=0;i<prev.length-1;i++){
      cur.push(Math.abs(prev[i]-prev[i+1]));
    }
    rows.push(cur);
  }
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r].length;c++){
      const v = rows[r][c];
      const val = Math.max(1, Math.min(15, v)); // clamp 1..15 per texture
      const mesh = new THREE.Mesh(GEO, matsFor(val));
      mesh.position.copy(posForMath(r,c));
      mesh.userData = { mode:'math', row:r, col:c, value:val };
      root.add(mesh); cubes.push(mesh);
    }
  }
  checkUniqueness();
}

// palette 1..15 (solo per vista math)
const palette = document.getElementById('palette');
function buildPalette(){
  palette.innerHTML = '';
  for(let n=1;n<=15;n++){
    const b=document.createElement('button');
    b.textContent = n;
    b.style.borderColor = '#ddd';
    b.style.color = '#111';
    palette.appendChild(b);
  }
}

// click su riga alta (assegna numero da palette)
let selectedN = 1;
palette.addEventListener('click', (e)=>{
  const b = e.target.closest('button');
  if(!b) return;
  selectedN = parseInt(b.textContent,10);
  [...palette.children].forEach(x=>x.style.borderColor='#ddd');
  b.style.borderColor = '#0b5fff';
});

renderer.domElement.addEventListener('pointerdown',(e)=>{
  // in math: se tocco un cubo della riga alta → assegno selectedN
  // altrimenti in qualsiasi vista → inizio drag per ruotare
  const hit = pick(e.clientX, e.clientY);
  if(currentView==='math' && hit && hit.object.userData && hit.object.userData.row===0){
    setValueAt(0, hit.object.userData.col, selectedN);
    e.preventDefault(); // evita drag immediato
    return;
  }
  dragging=true; px=e.clientX; py=e.clientY;
});
renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault(), {passive:false});

// ricalcola le righe sotto (math)
function recomputeBelow(){
  // leggi riga alta dai mesh
  const topMeshes = cubes.filter(m=>m.userData.mode==='math' && m.userData.row===0)
                         .sort((a,b)=>a.userData.col-b.userData.col);
  const top = topMeshes.map(m=>m.userData.value);
  const rows = [top.slice()];
  for(let r=1;r<5;r++){
    const prev = rows[r-1], cur=[];
    for(let i=0;i<prev.length-1;i++) cur.push(Math.abs(prev[i]-prev[i+1]));
    rows.push(cur);
  }
  // aggiorna mesh valori/texture
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r].length;c++){
      const v = rows[r][c];
      const mesh = cubes.find(m=>m.userData.mode==='math' && m.userData.row===r && m.userData.col===c);
      if(mesh){
        const vv = Math.max(1, Math.min(15, v));
        mesh.userData.value = vv;
        mesh.material.forEach((mat,i)=>{ mesh.material[i] = matsFor(vv)[i]; });
        mesh.material.needsUpdate = true;
      }
    }
  }
  checkUniqueness();
}

function setValueAt(row,col,val){
  const mesh = cubes.find(m=>m.userData.mode==='math' && m.userData.row===row && m.userData.col===col);
  if(!mesh) return;
  const vv = Math.max(1, Math.min(15, parseInt(val,10)||1));
  mesh.userData.value = vv;
  mesh.material.forEach((mat,i)=>{ mesh.material[i] = matsFor(vv)[i]; });
  mesh.material.needsUpdate = true;
  recomputeBelow();
}

// differenze uniche (10 valori dalla riga 1..4)
function checkUniqueness(){
  const all = [];
  for(let r=1;r<=4;r++){
    const rowMeshes = cubes.filter(m=>m.userData.mode==='math' && m.userData.row===r);
    rowMeshes.sort((a,b)=>a.userData.col-b.userData.col);
    rowMeshes.forEach(m=>all.push(m.userData.value));
  }
  const set = new Set(all);
  setStatus(`Differenze uniche: ${set.size}/10`);
}

function setStatus(t){ (document.getElementById('status')||{}).textContent = t; }

// ---------- Interazioni rotazione ----------
let dragging=false, px=0, py=0;
window.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  root.rotation.y += dx; root.rotation.x += dy;
  px=e.clientX; py=e.clientY;
}, {passive:true});
window.addEventListener('pointerup', ()=> dragging=false, {passive:true});

// raycast
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(cx,cy){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((cx - r.left)/r.width)*2 - 1;
  ndc.y = -((cy - r.top)/r.height)*2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children, true);
  if(!hits.length) return null;
  // risaliamo al mesh di livello cube (può essere direttamente il mesh)
  let o = hits[0].object; while(o && o.parent && o.parent!==root){ o=o.parent; }
  return { object:o };
}

// ---------- UI ----------
const viewSel = document.getElementById('view');
const btnShuffle = document.getElementById('btn-shuffle');
const btnReset = document.getElementById('btn-reset');

let currentView = 'layers'; // default richiesto

viewSel?.addEventListener('change', e=>{
  currentView = e.target.value;
  document.body.classList.toggle('hidePalette', currentView!=='math');
  if(currentView==='math'){ buildMath(); } else { buildLayers(); }
});

btnShuffle?.addEventListener('click', ()=>{
  if(currentView!=='math') return; // mescola solo in vista matematica
  // mescola 5 numeri casuali nella riga alta
  for(let k=0;k<5;k++){
    const mesh = cubes.find(m=>m.userData.mode==='math' && m.userData.row===0 && m.userData.col===k);
    const val = 1 + (Math.random()*15|0);
    setValueAt(0, k, val);
  }
  recomputeBelow();
});

btnReset?.addEventListener('click', ()=>{
  root.rotation.set(0,0,0);
  if(currentView==='math'){ // ripristina 1..5 in alto
    for(let k=0;k<5;k++) setValueAt(0,k, k+1);
    recomputeBelow();
  }
});

// ---------- Avvio ----------
buildPalette();
document.body.classList.toggle('hidePalette', currentView!=='math');
(currentView==='math' ? buildMath : buildLayers)();

// loop
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})(); 
