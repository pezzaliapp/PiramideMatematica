(()=>{'use strict';
/**
 * Piramide Matematica 3D (15 numeri).
 * - Row schema: [5,4,3,2,1].
 * - Top (5 cubi) interattivo: swap a coppie.
 * - Sotto: differenze assolute auto-calcolate.
 * - Regola: le 10 differenze devono essere tutte diverse → duplicati evidenziati in rosso.
 * - Camera fit + resize robusto.
 */

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

// Camera
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, 12, 26);
camera.lookAt(0,0,0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff, .95));
const dir = new THREE.DirectionalLight(0xffffff, .35);
dir.position.set(6,12,10);
scene.add(dir);

// UI (opzionale)
const $ = sel => document.querySelector(sel);
const statusEl = $('#status');
function setStatus(ok){ if(statusEl) statusEl.innerHTML = `Differenze uniche: <b>${ok}/10</b>`; }

// Resize + fit
function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  if (cubes.length) fitCameraToPyramid();
  renderer.render(scene,camera);
}
addEventListener('resize', onResize, {passive:true});

// ---- Parametri piramide (15 cubi)
const ROWS = [5,4,3,2,1];
const STEP_X = 2.1, STEP_Y = 2.2, STEP_Z = 1.2;
const CUBE   = 2.08;
const GEO    = new THREE.BoxGeometry(CUBE,CUBE,CUBE);
const FACE_BG = '#1b2538';

// Palette (per differenziare i cubi visivamente)
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLORS = Array.from({length:15},(_,i)=>{ const h=i/15,s=0.6,v=0.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|(b); });

// Stato
const cubes=[]; // {mesh,row,col,value,mats}
let selected=null; // mesh selezionato sul top

// Testo (stesso numero su TUTTE le 6 facce)
function makeNumberTexture(num, fg='#fff', bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  if(num!=='' && num!=null) g.fillText(num,128,142);
  const tx=new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}

// 6 materiali identici (numero su tutte le facce)
function buildMaterials(colorHex, num){
  const tx = makeNumberTexture(num,'#fff',FACE_BG);
  const side = new THREE.MeshLambertMaterial({color:colorHex, map:tx});
  return [side.clone(),side.clone(),side.clone(),side.clone(),side.clone(),side.clone()];
}

// Posizioni centrate (piramide con “profondità” su Z)
function positionFor(row,col){
  const n = ROWS[row];
  const x = (col - (n-1)/2) * STEP_X;
  const y = (((ROWS.length-1)/2) - row) * STEP_Y;
  const z = (row - (ROWS.length-1)/2) * STEP_Z;
  return new THREE.Vector3(x,y,z);
}

function linearIndex(row,col){ let i=0; for(let r=0;r<row;r++) i+=ROWS[r]; return i+col; }

// Costruzione
function buildScene(){
  // pulizia
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i]; if(o.isMesh) scene.remove(o);
  }
  cubes.length=0;

  // Top casuale: 5 numeri distinti da 1..15
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const top = pool.slice(0,5);

  // Calcola differenze per le righe successive
  const valuesByRow=[top];
  for(let r=1;r<ROWS.length;r++){
    const above = valuesByRow[r-1], rowVals=[];
    for(let c=0;c<above.length-1;c++) rowVals.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=rowVals;
  }

  // Crea 15 cubi
  let k=0;
  for(let r=0;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const val = valuesByRow[r][c];
      const mats = buildMaterials(COLORS[k%COLORS.length], val);
      const mesh = new THREE.Mesh(GEO, mats);
      mesh.position.copy(positionFor(r,c));
      mesh.userData = {row:r,col:c};
      scene.add(mesh);
      cubes.push({mesh,row:r,col:c,value:val,mats});
      k++;
    }
  }

  fitCameraToPyramid();
  applyAndCheck();
}

// Aggiorna numero su tutte le 6 facce
function setCubeNumber(i,num){
  const c=cubes[i]; c.value=num;
  for(let f=0; f<6; f++){
    c.mats[f].map?.dispose?.();
    c.mats[f].map = makeNumberTexture(num,'#fff',FACE_BG);
    c.mats[f].needsUpdate = true;
  }
  c.mesh.material = c.mats;
}

// Evidenziatore
function setHighlight(i,on){
  const c=cubes[i]; const baseCol=COLORS[(linearIndex(c.row,c.col))%COLORS.length];
  for(let f=0; f<6; f++){
    const m=c.mats[f];
    if(on){ m.color.setHex(0xc0392b); m.emissive=new THREE.Color(0x330000); m.emissiveIntensity=.7; }
    else { m.color.setHex(baseCol);   m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0; }
    m.needsUpdate=true;
  }
}

// Applica differenze e controlla unicità
function applyAndCheck(){
  // Top corrente
  const top = []; for(let c=0;c<5;c++) top.push(cubes[linearIndex(0,c)].value);

  // Ricalcola sotto
  const valuesByRow=[top];
  for(let r=1;r<ROWS.length;r++){
    const above=valuesByRow[r-1], rowVals=[];
    for(let c=0;c<above.length-1;c++) rowVals.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=rowVals;
  }

  // Aggiorna cubi + clear highlight
  for(let i=0;i<cubes.length;i++) setHighlight(i,false);
  for(let r=0;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const idx = linearIndex(r,c);
      setCubeNumber(idx, valuesByRow[r][c]);
    }
  }

  // Unicità sulle 10 differenze
  const posByDiff={};
  for(let r=1;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const idx=linearIndex(r,c), v=valuesByRow[r][c];
      (posByDiff[v] ||= []).push(idx);
    }
  }
  const duplicates = Object.keys(posByDiff).filter(k=>posByDiff[k].length>1);
  duplicates.forEach(k=>posByDiff[k].forEach(i=>setHighlight(i,true)));
  const uniqueCount = 10 - duplicates.reduce((a,k)=>a+(posByDiff[k].length-1),0);
  setStatus(uniqueCount);
}

// --- Picking top-only per swap ---
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pickTop(mx,my){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((mx-r.left)/r.width)*2-1; ndc.y= -((my-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(scene.children,true);
  for(const h of hits){
    let m=h.object; while(m && !m.userData?.hasOwnProperty('row')) m=m.parent;
    if(m && m.userData.row===0) return m;
  }
  return null;
}

function onPointerDown(e){
  const t=e.touches?e.touches[0]:e;
  const m = pickTop(t.clientX,t.clientY);
  if(!m) return;
  if(selected===m){ selected=null; return; }
  if(!selected){ selected=m; return; }
  // swap
  const ia = cubes.findIndex(x=>x.mesh===selected);
  const ib = cubes.findIndex(x=>x.mesh===m);
  const av = cubes[ia].value, bv=cubes[ib].value;
  setCubeNumber(ia,bv); setCubeNumber(ib,av);
  selected=null;
  applyAndCheck();
}
renderer.domElement.addEventListener('mousedown', onPointerDown, {passive:true});
renderer.domElement.addEventListener('touchstart', onPointerDown, {passive:true});

// Drag per ruotare la scena (sullo sfondo)
let rotating=false, lx=0, ly=0;
renderer.domElement.addEventListener('pointerdown', e=>{ if(!pickTop(e.clientX,e.clientY)) {rotating=true; lx=e.clientX; ly=e.clientY;} });
addEventListener('pointermove', e=>{ if(!rotating) return; const dx=(e.clientX-lx)/140, dy=(e.clientY-ly)/140; scene.rotation.y+=dx; scene.rotation.x+=dy; lx=e.clientX; ly=e.clientY; });
addEventListener('pointerup', ()=> rotating=false);

// Bottoni
$('#btn-shuffle')?.addEventListener('click', ()=>{
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const top = pool.slice(0,5);
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), top[c]);
  applyAndCheck();
});

$('#btn-reset')?.addEventListener('click', ()=>{
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), c+1);
  applyAndCheck();
});

// Fit automatico della camera alla piramide
function fitCameraToPyramid(){
  const box = new THREE.Box3();
  for(const c of cubes) box.expandByObject(c.mesh);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);

  const fitOffset = 1.25;
  const maxSize = Math.max(size.x,size.y,size.z);
  const fov = camera.fov * (Math.PI/180);
  let dist = (maxSize/2) / Math.tan(fov/2);
  dist *= fitOffset;

  const dirV = new THREE.Vector3().subVectors(camera.position, camera.lookAt || new THREE.Vector3()).normalize();
  camera.position.copy(center.clone().add(dirV.multiplyScalar(dist)));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Start
buildScene();
onResize(); // assicura il primo render corretto
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
