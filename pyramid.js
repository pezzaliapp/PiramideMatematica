(()=>{'use strict';
/**
 * Piramide Matematica 3D (15 cubi = 5,4,3,2,1).
 * - Top (5 cubi) interattivo: swap a coppie.
 * - Sotto: differenze assolute, calcolate automaticamente.
 * - Regola: le 10 differenze (4+3+2+1) devono essere tutte diverse.
 * - Evidenziazione rossa per differenze duplicate.
 * - Ogni cubo mostra la stessa cifra su tutte e 6 le facce (1..15).
 */

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

// Camera prospettica
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

// Resize
function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); renderer.render(scene,camera);
}
window.addEventListener('resize', onResize, {passive:true}); onResize();

// Layout piramide 5-4-3-2-1 (15 cubi)
const ROWS = [5,4,3,2,1];
const STEP_X = 2.1, STEP_Y = 2.2, STEP_Z = 1.6;
const CUBE   = 2.08;      // ~STEP_X per look “unito”
const GEO    = new THREE.BoxGeometry(CUBE,CUBE,CUBE);
const FACE_BG = '#1b2538';

// Palette per i bordi/lati
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLORS = Array.from({length:15},(_,i)=>{ const h=i/15,s=0.6,v=0.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|(b); });

// Stato
const cubes=[]; // {mesh,row,col,value,mats}
let selected=null; // mesh selezionato sul top (row=0)

// Helpers
const $ = s => document.querySelector(s);
function setStatus(ok){ $('#status')?.( $('#status').innerHTML = `Differenze uniche: <b>${ok}/10</b>` ); }

// Testo (stesso numero su tutte le 6 facce)
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
  // 6 facce uguali (stesso numero)
  return [side.clone(),side.clone(),side.clone(),side.clone(),side.clone(),side.clone()];
}

// Posizionamento centrato + profondità a gradini (Z)
function positionFor(row,col){
  const count = ROWS[row];
  const x = (col - (count-1)/2) * STEP_X;
  const y = (((ROWS.length-1)/2) - row) * STEP_Y;
  const z = (row - (ROWS.length-1)/2) * STEP_Z;
  return new THREE.Vector3(x,y,z);
}

function linearIndex(row,col){ let i=0; for(let r=0;r<row;r++) i+=ROWS[r]; return i+col; }

// Costruzione scena
function buildScene(){
  while(scene.children.find(o=>o.isMesh)) {
    const m = scene.children.find(o=>o.isMesh);
    scene.remove(m);
  }
  cubes.length=0;

  // Numeri iniziali (top casuale 5 elementi presi da 1..15 senza ripetizioni)
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const top = pool.slice(0,5);

  // Creo 15 cubi (5+4+3+2+1)
  let k=0, valuesByRow=[top];
  for(let r=1;r<ROWS.length;r++){
    const above = valuesByRow[r-1], rowVals=[];
    for(let c=0;c<above.length-1;c++) rowVals.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=rowVals;
  }

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

  applyAndCheck();
}

// Aggiorna il numero visualizzato su TUTTE le 6 facce
function setCubeNumber(i,num){
  const c=cubes[i]; c.value=num;
  // sostituisco le texture su tutti i materiali
  for(let f=0; f<6; f++){
    c.mats[f].map?.dispose?.();
    c.mats[f].map = makeNumberTexture(num,'#fff',FACE_BG);
    c.mats[f].needsUpdate = true;
  }
  c.mesh.material = c.mats;
}

// Highlight ON/OFF
function setHighlight(i,on){
  const c=cubes[i]; const baseCol=COLORS[i%COLORS.length];
  for(let f=0; f<6; f++){
    const m=c.mats[f];
    if(on){ m.color.setHex(0xc0392b); m.emissive=new THREE.Color(0x300000); m.emissiveIntensity=.7; }
    else { m.color.setHex(baseCol);   m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0; }
    m.needsUpdate=true;
  }
}

// Ricostruisce i livelli sotto in base ai 5 top correnti, evidenzia duplicati
function applyAndCheck(){
  // leggi top
  const top = [];
  for(let c=0;c<5;c++) top.push(cubes[linearIndex(0,c)].value);

  // calcola differenze
  const valuesByRow=[top];
  for(let r=1;r<ROWS.length;r++){
    const above = valuesByRow[r-1], rowVals=[];
    for(let c=0;c<above.length-1;c++) rowVals.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=rowVals;
  }

  // applica ai cubi
  for(let i=0;i<cubes.length;i++) setHighlight(i,false);
  for(let r=0;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const idx = linearIndex(r,c);
      setCubeNumber(idx, valuesByRow[r][c]);
    }
  }

  // controlla duplicati nelle differenze (4+3+2+1 = 10)
  const posByDiff={};
  for(let r=1;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const idx=linearIndex(r,c), v=valuesByRow[r][c];
      (posByDiff[v] ||= []).push(idx);
    }
  }
  const duplicates = Object.keys(posByDiff).filter(k=>posByDiff[k].length>1);
  duplicates.forEach(k=>posByDiff[k].forEach(i=>setHighlight(i,true)));
  const unique = 10 - duplicates.reduce((a,k)=>a+(posByDiff[k].length-1),0);
  setStatus?.(unique);
}

// Pick top-only
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pickTop(mx,my){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((mx-r.left)/r.width)*2-1; ndc.y=-((my-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(scene.children,true);
  for(const h of hits){
    let m=h.object;
    while(m && !m.userData?.hasOwnProperty('row')) m=m.parent;
    if(m && m.userData.row===0) return m;
  }
  return null;
}

// Interazione: swap top cubes
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

// Rotazione scena (drag sullo sfondo)
let rotating=false, lx=0, ly=0;
function bgDown(e){ if(e.target!==renderer.domElement) return; rotating=true; lx=e.clientX; ly=e.clientY; }
function bgMove(e){ if(!rotating) return; const dx=(e.clientX-lx)/140, dy=(e.clientY-ly)/140; scene.rotation.y+=dx; scene.rotation.x+=dy; lx=e.clientX; ly=e.clientY; }
function bgUp(){ rotating=false; }
renderer.domElement.addEventListener('pointerdown', bgDown);
window.addEventListener('pointermove', bgMove);
window.addEventListener('pointerup', bgUp);

// UI bottoni se presenti
const btnShuffle = document.getElementById('btn-shuffle');
const btnReset   = document.getElementById('btn-reset');

btnShuffle?.addEventListener('click', ()=>{
  // rimescola SOLO i 5 top con numeri 1..15 tutti diversi
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const top = pool.slice(0,5);
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), top[c]);
  applyAndCheck();
});

btnReset?.addEventListener('click', ()=>{
  // top sequenziale 1..5
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), c+1);
  applyAndCheck();
});

// Start
buildScene();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();
})();
