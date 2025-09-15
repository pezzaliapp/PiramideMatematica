(() => {
'use strict';

/* =========================================================
   La Piramide Matematica 3D — base 5×5 editabile (25 celle)
   - Inserimento numeri 1..15 su QUALSIASI cella del layer 5×5
   - Differenze 2D sui livelli inferiori:
       B[i,j] = max(|A[i,j]-A[i+1,j]|, |A[i,j]-A[i,j+1]|)
   - 0 vietato; duplicati nella BASE (5×5) evidenziati in rosso
   - Numeri su 6 facce, tema KubeApp (colori da CSS vars)
   ========================================================= */

/* ---------- Scene & Camera ---------- */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(getCSS('--bg','#0c0f14'));

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 30, 60);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

/* ---------- Luci ---------- */
scene.add(new THREE.AmbientLight(0xffffff, .95));
const dir = new THREE.DirectionalLight(0xffffff, .25);
dir.position.set(20,25,12); scene.add(dir);

/* ---------- Costanti piramide ---------- */
const LAYERS = [5,4,3,2,1];
const STEP   = 2.25;
const STEP_Y = 2.25;
const SIZE   = 2.20;
const GEO    = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

/* ---------- Stato ---------- */
// Base 5×5 interamente editabile
const baseValues = Array.from({length:5},()=>Array(5).fill(null));

const cubes = [];  // {mesh, edges, layer, i, j, value}
window.__allCubeMeshes = [];
window.__edgeLines     = [];
let selectedNumber = 1;

/* ---------- Helpers CSS vars ---------- */
function getCSS(varName, fallback){ 
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/* ---------- CanvasTexture per numeri su 6 facce ---------- */
function makeNumberTexture(num, ink='#111', face='#fff'){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = face; g.fillRect(0,0,256,256);
  g.strokeStyle = getCSS('--edge','#000'); g.lineWidth = 8; g.strokeRect(6,6,244,244);
  g.fillStyle = ink;
  g.font = 'bold 160px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(num==null?'':String(num), 128, 140);
  const tx = new THREE.CanvasTexture(c); tx.anisotropy=8; tx.needsUpdate=true; 
  return tx;
}
function matsFor(num, colorOverride=null){
  const face = colorOverride || getCSS('--cube','#fff');
  const ink  = colorOverride ? '#fff' : getCSS('--ink','#fff');
  const tx = makeNumberTexture(num, ink, face);
  return new Array(6).fill(0).map(()=> new THREE.MeshBasicMaterial({map:tx, toneMapped:false}));
}

/* ---------- Posizionamento ---------- */
function posFor(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2)*STEP;
  const z = (j - (N-1)/2)*STEP;
  const y = -layerIdx*STEP_Y;
  return new THREE.Vector3(x,y,z);
}

/* ---------- Build piramide ---------- */
function buildPyramid(){
  for (const c of cubes){
    if (c.mesh) scene.remove(c.mesh);
    if (c.edges) scene.remove(c.edges);
  }
  cubes.length = 0; window.__allCubeMeshes.length=0; window.__edgeLines.length=0;

  for (let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for (let i=0;i<N;i++) for (let j=0;j<N;j++){
      const m = new THREE.Mesh(GEO, matsFor(null));
      m.position.copy(posFor(l,i,j)); scene.add(m);
      const egeo = new THREE.EdgesGeometry(GEO);
      const eln  = new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({color:getCSS('--edge','#000')}));
      eln.position.copy(m.position); scene.add(eln);
      const cell = {mesh:m, edges:eln, layer:l, i, j, value:null};
      cubes.push(cell); window.__allCubeMeshes.push(m); window.__edgeLines.push(eln);
    }
  }
}
buildPyramid();

/* ---------- Render loop ---------- */
let _dirty=true; function requestRender(){ _dirty=true; }
(function loop(){ if(_dirty){renderer.render(scene,camera); _dirty=false;} requestAnimationFrame(loop); })();

/* ---------- Resize ---------- */
function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); requestRender();
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ---------- Rotazione mouse/touch ---------- */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown',(e)=>{dragging=true;px=e.clientX;py=e.clientY;});
addEventListener('pointerup',()=>dragging=false);
addEventListener('pointermove',(e)=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px=e.clientX; py=e.clientY; requestRender();
});

/* ================= LOGICA DI GIOCO ================= */

function idxBase(layer){ let s=0; for(let t=0;t<layer;t++) s+=LAYERS[t]*LAYERS[t]; return s; }
function getCell(layer,i,j){
  const N=LAYERS[layer]; if(i<0||j<0||i>=N||j>=N) return null;
  return cubes[idxBase(layer)+ i*N + j];
}
function setCellValue(cell,val,asError=false){
  cell.value=val;
  cell.mesh.material.forEach(m=>{ if(m.map){m.map.dispose(); m.map=null;} });
  const mats = matsFor(val, asError?getCSS('--dup','#ff3b30'):null);
  cell.mesh.material = mats;
  cell.edges.material.color.set(getCSS('--edge','#000'));
}

function recomputeAll(){
  // Layer 0 = baseValues (così come inseriti dall'utente)
  for (let i=0;i<5;i++){
    for (let j=0;j<5;j++){
      setCellValue(getCell(0,i,j), baseValues[i][j], false);
    }
  }

  // Layer inferiori (2D): B[i,j] = max(|A[i,j]-A[i+1,j]|, |A[i,j]-A[i,j+1]|)
  for (let L=1; L<LAYERS.length; L++){
    const N = LAYERS[L];
    const P = L-1;
    for (let i=0;i<N;i++){
      for (let j=0;j<N;j++){
        const a00 = getCell(P,i,j)?.value;
        const a10 = getCell(P,i+1,j)?.value;
        const a01 = getCell(P,i,j+1)?.value;
        const v = (a00==null||a10==null||a01==null) ? null : Math.max(Math.abs(a00-a10), Math.abs(a00-a01));
        setCellValue(getCell(L,i,j), v, false);
      }
    }
  }

  // Evidenzia duplicati (e 0) SOLTANTO sulla base; riflette la texture rossa anche ai livelli sotto
  const freq=new Map();
  for (let i=0;i<5;i++) for (let j=0;j<5;j++){
    const v=baseValues[i][j];
    if (v!=null && v>0) freq.set(v,(freq.get(v)||0)+1);
  }
  const dup=new Set(); for (const [n,c] of freq) if (c>1) dup.add(n);
  for (let i=0;i<5;i++) for (let j=0;j<5;j++){
    const v=baseValues[i][j];
    if (v===0 || dup.has(v)){
      const c=getCell(0,i,j);
      c.mesh.material.forEach(m=>{ if(m.map){m.map.dispose(); m.map=null;} });
      c.mesh.material = matsFor(v, getCSS('--dup','#ff3b30'));
    }
  }

  repaintStatus(); requestRender();
}

function repaintStatus(){
  // Conta quante celle non-null nei 4 livelli inferiori (massimo 16+9+4+1 = 30)
  let filled=0, values=[];
  for (let L=1; L<LAYERS.length; L++){
    const N=LAYERS[L];
    for (let i=0;i<N;i++) for (let j=0;j<N;j++){
      const v=getCell(L,i,j).value;
      if (v!=null){ filled++; values.push(v); }
    }
  }
  // Mostriamo “differenze uniche” come size dell’insieme delle celle calcolate
  const uniq = new Set(values).size;
  document.getElementById('status').innerHTML = `Differenze uniche: <b>${uniq}/30</b>`;
}

/* Palette 1..15 */
const pal=document.getElementById('palette');
(function buildPalette(){
  for(let n=1;n<=15;n++){
    const d=document.createElement('div'); d.className='chip'; d.textContent=n;
    d.addEventListener('click',()=>{
      selectedNumber=n; pal.querySelectorAll('.chip').forEach(x=>x.classList.remove('active')); d.classList.add('active');
    });
    pal.appendChild(d);
  }
  pal.firstChild.classList.add('active'); selectedNumber=1;
})();

/* Picking QUALSIASI base cell (layer 0, i=0..4, j=0..4) */
const raycaster=new THREE.Raycaster(); const mouse=new THREE.Vector2();
function pickBaseCell(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((x-r.left)/r.width)*2-1; mouse.y=-((y-r.top)/r.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  // raccogliamo TUTTE le mesh del layer 0
  const baseMeshes=[]; for(let i=0;i<5;i++) for(let j=0;j<5;j++) baseMeshes.push(getCell(0,i,j).mesh);
  const hits=raycaster.intersectObjects(baseMeshes,false);
  if(!hits.length) return null;
  // risaliamo a i,j
  const mesh = hits[0].object;
  for (let i=0;i<5;i++) for (let j=0;j<5;j++){
    if (getCell(0,i,j).mesh === mesh) return {i,j};
  }
  return null;
}
renderer.domElement.addEventListener('click',(ev)=>{
  const slot = pickBaseCell(ev.clientX, ev.clientY);
  if (!slot) return;
  const v = selectedNumber|0; if(!(v>=1 && v<=15)) return;
  baseValues[slot.i][slot.j] = v;
  recomputeAll();
});

/* Bottoni */
document.getElementById('btn-reset').addEventListener('click',()=>{
  for (let i=0;i<5;i++) for (let j=0;j<5;j++) baseValues[i][j]=null;
  recomputeAll();
});
document.getElementById('btn-shuffle').addEventListener('click',()=>{
  // Inserisce 5 numeri distinti casuali in 5 posizioni casuali della base; le altre restano vuote
  for (let i=0;i<5;i++) for (let j=0;j<5;j++) baseValues[i][j]=null;
  const coords=[]; for (let i=0;i<5;i++) for (let j=0;j<5;j++) coords.push([i,j]);
  coords.sort(()=>Math.random()-.5);
  const nums = Array.from({length:15},(_,k)=>k+1).sort(()=>Math.random()-.5).slice(0,5);
  for (let k=0;k<5;k++){ const [i,j]=coords[k]; baseValues[i][j]=nums[k]; }
  recomputeAll();
});

/* Primo render */
recomputeAll();

/* ================= Tema / Impostazioni Kube ================= */
(function settingsBlock(){
  const DEFAULTS={brand:'#0b5fff',bg:'#0c0f14',ink:'#ffffff',cube:'#ffffff',edge:'#000000',dup:'#ff3b30'};
  const LS_KEY='piramide.theme.v1';
  const $=(id)=>document.getElementById(id);
  function load(){ try{return {...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY))||{})}; }catch{ return {...DEFAULTS}; } }
  function save(t){ localStorage.setItem(LS_KEY, JSON.stringify(t)); }
  function apply(t){
    const r=document.documentElement.style;
    r.setProperty('--brand',t.brand); r.setProperty('--bg',t.bg); r.setProperty('--ink',t.ink);
    r.setProperty('--cube',t.cube);   r.setProperty('--edge',t.edge); r.setProperty('--dup',t.dup);
    const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.setAttribute('content',t.brand);
    // rigenera tutte le texture coerenti
    for (const c of cubes){
      c.mesh.material.forEach(m=>{ if(m.map){m.map.dispose(); m.map=null;} });
      c.mesh.material = matsFor(c.value,null);
    }
    for(const ln of window.__edgeLines) ln.material.color.set(getCSS('--edge','#000'));
    requestRender();
  }
  let THEME=load(); apply(THEME);

  const dlg=$('settings'), open=$('btn-settings'), saveBtn=$('btn-save-theme'), resetBtn=$('btn-reset-theme');
  const cBar=$('c-bar'),cBg=$('c-bg'),cInk=$('c-ink'),cCube=$('c-cube'),cEdge=$('c-edge'),cDup=$('c-dup');
  function fill(){ cBar.value=THEME.brand; cBg.value=THEME.bg; cInk.value=THEME.ink; cCube.value=THEME.cube; cEdge.value=THEME.edge; cDup.value=THEME.dup; }
  open?.addEventListener('click',()=>{ fill(); dlg.showModal(); });
  saveBtn?.addEventListener('click',(e)=>{ e.preventDefault(); THEME={brand:cBar.value,bg:cBg.value,ink:cInk.value,cube:cCube.value,edge:cEdge.value,dup:cDup.value}; save(THEME); apply(THEME); dlg.close(); recomputeAll(); });
  resetBtn?.addEventListener('click',()=>{ THEME={...DEFAULTS}; save(THEME); apply(THEME); fill(); recomputeAll(); });

  $('btn-theme-kube')?.addEventListener('click',()=>{ cBar.value='#0b5fff'; cBg.value='#0c0f14'; cInk.value='#ffffff'; cCube.value='#ffffff'; cEdge.value='#000000'; cDup.value='#ff3b30'; });
  $('btn-theme-dark')?.addEventListener('click',()=>{ cBar.value='#111827'; cBg.value='#0a0d12'; cInk.value='#f5f7ff'; cCube.value='#ffffff'; cEdge.value='#000000'; cDup.value='#ff3b30'; });
  $('btn-theme-light')?.addEventListener('click',()=>{ cBar.value='#2563eb'; cBg.value='#f6f7fb'; cInk.value='#0b1020'; cCube.value='#ffffff'; cEdge.value='#000000'; cDup.value='#d92d20'; });
})();
})();
