(()=>{'use strict';

/* ============ Setup base ============ */
const stage = document.getElementById('stage');
if(!stage){ console.error('#stage mancante'); return; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
camera.position.set(0, 26, 44);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, .95));
const dir = new THREE.DirectionalLight(0xffffff, .35);
dir.position.set(10,18,12); scene.add(dir);

const $ = s => document.querySelector(s);
const statusEl = $('#status');
const setStatus = (ok)=>{ if(statusEl) statusEl.innerHTML = `Differenze uniche: <b>${ok}/10</b>`; };

/* ============ Geometria piramide ============ */
// layer quadrati: 5×5 (base), 4×4, 3×3, 2×2, 1×1 (punta). Base in ALTO (y≈0), si scende verso la punta.
const LAYERS = [5,4,3,2,1];

const STEP = 2.15;     // passo tra i centri X/Z
const STEP_Y = 2.30;   // passo vertical
const CUBE = 2.06;     // lato cubo
const GEO  = new THREE.BoxGeometry(CUBE,CUBE,CUBE);

// posizionamento centrato di ciascun cubo
function posFor(layer, i, j){
  const N = LAYERS[layer];
  const x = (i - (N-1)/2)*STEP;
  const z = (j - (N-1)/2)*STEP;
  const y = -layer*STEP_Y;     // base in alto, strati sotto con y negativa
  return new THREE.Vector3(x,y,z);
}

/* ============ Palette e materiali numerati ============ */
function hsvToRgb(h,s,v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLS = Array.from({length:15},(_,i)=>{ const h=i/15,s=.60,v=.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|b; });

const FACE_BG = '#1b2538';
function textTexture(num, fg='#fff', bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  if(num!=null && num!=='') g.fillText(num,128,150);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; t.needsUpdate=true; return t;
}
function matsFor(value, colorHex){
  const lam = new THREE.MeshLambertMaterial({ color: colorHex });
  const tx  = textTexture(value);
  const face= new THREE.MeshBasicMaterial({ map: tx }); // frontale sempre leggibile
  // stesso materiale su tutte le facce, ma frontale con texture numerica
  return [lam.clone(),lam.clone(),lam.clone(),lam.clone(),face,lam.clone()];
}

/* ============ Stato della piramide ============ */
// Rappresentiamo la logica “1D” per colonna, poi replichiamo su tutta la griglia di ogni layer.
let top5 = [1,2,3,4,5];                // i 5 numeri di partenza (1..15)
let rows = [];                         // rows[r] = array valori 1D di quel layer (len = LAYERS[r])
const cubes = [];                      // lista di oggetti {mesh, layer,i,j, mats}

/* ============ Costruzione griglie N×N per ogni layer ============ */
function buildScene(){
  // pulizia vecchi mesh
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i];
    if(o.isMesh) scene.remove(o);
  }
  cubes.length = 0;

  // ricava tutte le righe 1D (differenze) a partire da top5
  computeRows(top5);

  // costruisci layer quadrati replicando per colonna
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      const v = rows[l][i];
      for(let j=0;j<N;j++){
        const mats = matsFor(v, COLS[i%COLS.length]);
        const m = new THREE.Mesh(GEO, mats);
        m.position.copy(posFor(l,i,j));
        m.userData = { layer:l, i, j };
        scene.add(m);
        cubes.push({ mesh:m, layer:l, i, j, mats });
      }
    }
  }
  fitCamera();
  checkUnique();  // 10/10 e nessuno zero
}

/* ============ Logica differenze 1D ============ */
function computeRows(arr5){
  rows = [];
  rows[0] = arr5.slice();
  for(let l=1;l<LAYERS.length;l++){
    const a = rows[l-1], b=[];
    for(let i=0;i<a.length-1;i++) b.push(Math.abs(a[i]-a[i+1]));
    rows[l]=b;
  }
}

function recomputeAndPaint(){
  computeRows(top5);
  // aggiorna i numeri di tutti i cubi in base alla colonna i del relativo layer
  for(const c of cubes){
    const v = rows[c.layer][c.i];
    // aggiorna texture della faccia frontale (indice 4 nel nostro array)
    const face = c.mats[4];
    if(face.map) face.map.dispose?.();
    face.map = textTexture(v);
    face.needsUpdate = true;
  }
  checkUnique();
}

/* ============ Validazione: 10 differenze uniche, no zero ============ */
function checkUnique(){
  const diffs = rows[1].concat(rows[2], rows[3], rows[4]); // 4+3+2+1 = 10
  const set = new Set(diffs);
  const noZero = diffs.every(v=>v>0);
  const score = (noZero ? set.size : 0);
  setStatus(score);
  // highlight (rosso) i valori duplicati o zero
  const isBad = new Set();
  const cnt = {};
  diffs.forEach(v=>cnt[v]=(cnt[v]||0)+1);
  for(const v of diffs){ if(v===0 || cnt[v]>1) isBad.add(v); }
  for(const c of cubes){
    const v = rows[c.layer][c.i];
    const base = COLS[c.i%COLS.length];
    for(let f=0; f<6; f++){
      if(isBad.has(v)){ c.mats[f].color.setHex(0xc0392b); c.mats[f].emissive=new THREE.Color(0x330000); c.mats[f].emissiveIntensity=.7; }
      else { c.mats[f].color.setHex(base); c.mats[f].emissive=new THREE.Color(0x000000); c.mats[f].emissiveIntensity=0; }
      c.mats[f].needsUpdate = true;
    }
  }
}

/* ============ Interazione: swap colonne del top ============ */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((x-r.left)/r.width)*2-1; ndc.y= -((y-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(scene.children,true);
  for(const h of hits){
    let o=h.object;
    while(o && !o.userData) o=o.parent;
    if(o && o.userData.layer===0) return o.userData; // solo sul layer top
  }
  return null;
}

let sel=null;
function onTap(e){
  const t=e.touches?e.touches[0]:e;
  const hit = pick(t.clientX,t.clientY);
  if(!hit) return;
  if(!sel){ sel=hit; return; }
  const a=sel.i, b=hit.i;
  if(a!==b){ [top5[a], top5[b]] = [top5[b], top5[a]]; recomputeAndPaint(); }
  sel=null;
}
renderer.domElement.addEventListener('mousedown', onTap, {passive:true});
renderer.domElement.addEventListener('touchstart', onTap, {passive:true});

// rotazione scena trascinando lo sfondo
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  if(!pick(e.clientX,e.clientY)){ dragging=true; px=e.clientX; py=e.clientY; }
});
addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px=e.clientX; py=e.clientY;
});
addEventListener('pointerup', ()=> dragging=false);

/* ============ Camera fit + resize ============ */
function fitCamera(){
  const box = new THREE.Box3();
  for(const o of scene.children) if(o.isMesh) box.expandByObject(o);
  if(box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const maxSize = Math.max(size.x,size.y,size.z);
  const fov = camera.fov * Math.PI/180;
  let dist = (maxSize/2)/Math.tan(fov/2) * 1.25;
  camera.position.copy(center.clone().add(new THREE.Vector3(0,0,1).multiplyScalar(dist)));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}
function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  renderer.render(scene,camera);
}
addEventListener('resize', onResize, {passive:true});

/* ============ Shuffle: 5 numeri 1..15, tutti distinti, no zeri, 10/10 uniche ============ */
function shuffleTop(){
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let tries=0; tries<800; tries++){
    // estrai 5 distinti casuali
    for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
    const cand = pool.slice(0,5);
    // scarta se produce zeri o non 10/10
    computeRows(cand);
    const diffs = rows[1].concat(rows[2],rows[3],rows[4]);
    const ok = diffs.every(v=>v>0) && (new Set(diffs)).size===10;
    if(ok){ top5=cand; recomputeAndPaint(); return; }
  }
  // fallback: ordine fisso (rarissimo)
  top5=[1,5,9,12,15]; recomputeAndPaint();
}

/* ============ Bottoni ============ */
$('#btn-reset')?.addEventListener('click', ()=>{ top5=[1,2,3,4,5]; recomputeAndPaint(); });
$('#btn-shuffle')?.addEventListener('click', shuffleTop);

/* ============ Avvio ============ */
buildScene();
onResize();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

console.log('Piramide 3D quadrata ok');

})();
