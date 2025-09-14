(()=>{'use strict';

/* ---------- util dom ---------- */
const $ = s => document.querySelector(s);
const stage = $('#stage');
const btnShuffle = $('#btn-shuffle');
const btnReset   = $('#btn-reset');
const statusEl   = $('#status');
const setStatus  = n => statusEl && (statusEl.innerHTML = `Differenze uniche: <b>${n}/10</b>`);

/* ---------- three.js base ---------- */
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
const key = new THREE.DirectionalLight(0xffffff, .35);
key.position.set(10,18,12);
scene.add(key);

// contenitore di tutto ciò che si muove/scala
const root = new THREE.Group();
scene.add(root);

function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener('resize', onResize, {passive:true});
onResize();

/* ---------- parametri piramide ---------- */
const LAYERS = [5,4,3,2,1];        // base in alto → punta in basso
const STEP   = 2.15;               // passo X/Z (centro-centro)
const STEP_Y = 2.30;               // passo verticale
const CUBE   = 2.06;               // lato del cubo
const GEO    = new THREE.BoxGeometry(CUBE, CUBE, CUBE);

// posizione di ogni cubo (i = colonna, j = colonna “profondità”, layer = riga della piramide)
function posFor(layer,i,j){
  const N = LAYERS[layer];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = -layer * STEP_Y;     // y=0 base (5×5), scendendo diminuisce
  return new THREE.Vector3(x,y,z);
}

/* ---------- palette + texture dei numeri ---------- */
function hsvToRgb(h,s,v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLS = Array.from({length:15},(_,i)=>{ const h=i/15,s=.60,v=.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|b; });

const FACE_BG = '#1b2538';
function numberTexture(n, fg='#fff', bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  if(n != null && n !== '') g.fillText(String(n),128,150);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; t.needsUpdate=true; return t;
}

function matsFor(value, colorHex){
  const lam = new THREE.MeshLambertMaterial({ color: colorHex });
  const face= new THREE.MeshBasicMaterial({ map: numberTexture(value) }); // +Z leggibile
  // ordine materiali: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
  return [lam.clone(),lam.clone(),lam.clone(),lam.clone(),face,lam.clone()];
}

/* ---------- stato & derivate ---------- */
// riga alta (5 numeri 1..15 distinti)
let top5 = [1,2,3,4,5];

// rows[l][i] = valore nella riga l, colonna i (l=0..4 → 5,4,3,2,1 valori)
let rows = [];

// cubetti allocati in scena
const cubes = []; // {mesh, layer, i, j, mats}

function computeRows(fromTop5){
  rows = []; rows[0] = fromTop5.slice();
  for(let l=1;l<LAYERS.length;l++){
    const a=rows[l-1], b=[];
    for(let i=0;i<a.length-1;i++) b.push(Math.abs(a[i]-a[i+1]));
    rows[l]=b;
  }
}

/* ---------- build / clear / repaint ---------- */
function clearRoot(){
  for(let i=root.children.length-1;i>=0;i--){
    const o=root.children[i];
    if(!o.isMesh){ root.remove(o); continue; }
    // pulizia sicura
    Array.isArray(o.material)
      ? o.material.forEach(m=>{ m.map?.dispose?.(); m.dispose?.(); })
      : (o.material && (o.material.map?.dispose?.(), o.material.dispose?.()));
    o.geometry?.dispose?.();
    root.remove(o);
  }
}

function buildScene(){
  clearRoot();
  computeRows(top5);
  cubes.length = 0;

  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0; i<N; i++){
      const valueAtColumn = rows[l][i];      // stesso valore ripetuto “in profondità”
      for(let j=0; j<N; j++){
        const mats = matsFor(valueAtColumn, COLS[i%COLS.length]);
        const mesh = new THREE.Mesh(GEO, mats);
        mesh.position.copy(posFor(l,i,j));
        mesh.userData = { layer:l, i, j };
        root.add(mesh);
        cubes.push({ mesh, layer:l, i, j, mats });
      }
    }
  }

  fitCamera();     // inquadra
  repaint();       // mostra numeri + highlight
}

// aggiorna numeri faccia +Z e stato
function repaint(){
  computeRows(top5);

  for(const c of cubes){
    const v = rows[c.layer][c.i];
    const face = c.mats[4];
    face.map?.dispose?.();
    face.map = numberTexture(v);
    face.needsUpdate = true;
  }

  checkUniqueAndHighlight();
}

/* ---------- validazione + highlight ---------- */
function checkUniqueAndHighlight(){
  // 4+3+2+1 = 10 differenze
  const diffs = rows[1].concat(rows[2], rows[3], rows[4]);

  const noZero = diffs.every(v => v>0);
  const uniqN  = noZero ? new Set(diffs).size : 0;
  setStatus(uniqN);

  const count = {};
  diffs.forEach(v => count[v] = (count[v]||0)+1);

  const badValues = new Set();
  diffs.forEach(v => { if(v===0 || count[v]>1) badValues.add(v); });

  for(const c of cubes){
    const v = rows[c.layer][c.i];
    const base = COLS[c.i%COLS.length];
    for(let f=0; f<6; f++){
      if(f===4) continue; // non toccare la MeshBasic con la texture
      c.mats[f].color.setHex( badValues.has(v) ? 0xc0392b : base );
      c.mats[f].needsUpdate = true;
    }
  }
}

/* ---------- fit camera ---------- */
function fitCamera(){
  const box = new THREE.Box3().setFromObject(root);
  if(!box.isEmpty()){
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI/180);
    let dist = (maxDim/2) / Math.tan(fov/2);

    dist *= 1.25; // padding
    camera.position.set(center.x, center.y + dist*0.4, center.z + dist);
    camera.lookAt(center);
  }
}

/* ---------- interazione ---------- */
// drag sullo sfondo: orbit “semplice”
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  // se sto puntando un cubo top row, non attivo il drag (lasciamo al click)
  const h = pick(e.clientX, e.clientY);
  if(h && h.object?.userData?.layer===0) return;
  dragging=true; px=e.clientX; py=e.clientY;
});
addEventListener('pointerup', ()=> dragging=false);
addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  root.rotation.y += dx; root.rotation.x += dy;
  px=e.clientX; py=e.clientY;
});

// pick con raycaster
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((x-r.left)/r.width)*2-1;
  ndc.y= -((y-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children, true);
  return hits[0] || null;
}

// click sui 5 cubi della riga alta: incrementa/decrementa 1..15 (Shift = -1)
renderer.domElement.addEventListener('click', e=>{
  const h = pick(e.clientX, e.clientY);
  if(!h) return;
  // risali al mesh “cubo” (potrei aver colpito una faccia)
  let m = h.object;
  while(m && m.parent!==root) m = m.parent;
  if(!m) return;

  const ud = m.userData || {};
  if(ud.layer !== 0) return; // solo top row
  const idx = ud.i;          // 0..4

  const delta = e.shiftKey ? -1 : +1;
  top5[idx] = wrap15(top5[idx] + delta);
  repaint();
});

function wrap15(n){
  // valori 1..15
  while(n<1)  n+=15;
  while(n>15) n-=15;
  return n;
}

/* ---------- UI ---------- */
btnReset?.addEventListener('click', ()=>{
  top5 = [1,2,3,4,5];
  repaint();
});

btnShuffle?.addEventListener('click', ()=>{
  // prendi 5 numeri **distinti** 1..15
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()* (i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  top5 = pool.slice(0,5).sort((a,b)=>a-b); // facoltativo: ordinati per partire “puliti”
  repaint();
});

/* ---------- bootstrap ---------- */
buildScene();

(function loop(){
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
})();

})();
