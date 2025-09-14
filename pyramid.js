(()=>{'use strict';
// Piramide Matematica 3D — base 5 in alto, 4-3-2-1 sotto. Vista ortografica, layout centrato e adattivo.

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

// ---- ORTHO CAMERA (più semplice da adattare al viewport)
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 100);
camera.position.set(0,0,10);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

// ---- Config geometria / passo. Facce quasi a contatto (look “unito”).
const STEP = 2.0;           // distanza tra i centri
const CUBE = 1.995;         // dimensione cubo (quasi = STEP per eliminare il distacco visivo)
const rows = [5,4,3,2,1];   // base in alto → punta in basso
const maxRow = rows[0];     // 5
const FACE_BG = '#24304a';

const GEO = new THREE.BoxGeometry(CUBE, CUBE, CUBE);

// Palette 15 colori
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLORS = Array.from({length:15},(_,i)=>{ const h=i/15,s=0.55,v=0.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|(b); });

// Stato
const cubes=[]; let topValues=[]; let selected=null; let toastTimer=null;
const $ = s => document.querySelector(s);
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1800); }
function setStatus(ok){ $('#status').innerHTML = `Differenze uniche: <b>${ok}/10</b>`; }

// Numeri sulla faccia frontale (+Z)
function makeNumberTexture(num, fg='#fff', bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  if(num!=='' && num!=null) g.fillText(num,128,142);
  const tx=new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}
function buildMaterials(colorHex, num){
  const base=new THREE.MeshLambertMaterial({color:colorHex});
  const mats=[base.clone(),base.clone(),base.clone(),base.clone(),base.clone(),base.clone()];
  mats[4]=new THREE.MeshBasicMaterial({map:makeNumberTexture(num,'#fff',FACE_BG)});
  return mats;
}

// Posizioni centrate: coordinate dei CENTRI
function positionFor(row,col){
  const count = rows[row];
  const x = (col - (count-1)/2) * STEP;
  const y = (((rows.length-1)/2) - row) * STEP;
  return new THREE.Vector3(x,y,0);
}
// Bounding box teorico della piramide (per calcolare il frustum ortografico)
function pyramidBounds(){
  const width  = (maxRow-1)*STEP + CUBE;
  const height = (rows.length-1)*STEP + CUBE;
  return {width, height};
}

// Camera fitting al viewport
function fitCamera(){
  const {width:W, height:H} = pyramidBounds();
  const w = stage.clientWidth, h = stage.clientHeight, aspect = w/h;
  // aggiungo margine 10%
  const margin = 1.10;
  let viewH = H * margin;
  let viewW = viewH * aspect;
  if(viewW < W * margin){
    viewW = W * margin;
    viewH = viewW / aspect;
  }
  camera.left = -viewW/2;
  camera.right =  viewW/2;
  camera.top =    viewH/2;
  camera.bottom = -viewH/2;
  camera.updateProjectionMatrix();
}
function onResize(){
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  fitCamera();
  renderer.render(scene,camera);
}
window.addEventListener('resize', onResize, {passive:true});
fitCamera();

// Build
function buildScene(){
  for(const c of cubes) scene.remove(c.mesh);
  cubes.length=0;
  let k=0;
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const mats=buildMaterials(COLORS[k%COLORS.length], '');
      const m=new THREE.Mesh(GEO, mats);
      m.position.copy(positionFor(r,c));
      m.userData={row:r,col:c,index:k,isTop:r===0};
      scene.add(m);
      cubes.push({mesh:m,row:r,col:c,value:0,mats});
      k++;
    }
  }
}
function setCubeNumber(i,num){
  const c=cubes[i]; c.value=num;
  c.mats[4].map?.dispose(); c.mats[4].dispose?.();
  c.mats[4]=new THREE.MeshBasicMaterial({map:makeNumberTexture(num||'','#fff',FACE_BG)});
  c.mesh.material=c.mats; c.mesh.material.needsUpdate=true;
}
function setHighlight(i,on){
  const c=cubes[i]; const baseCol=COLORS[i%COLORS.length];
  for(let f=0; f<6; f++){
    if(f===4) continue;
    const m=c.mats[f];
    if(on){ m.color.setHex(0xc0392b); m.emissive=new THREE.Color(0x300000); m.emissiveIntensity=0.7; }
    else { m.color.setHex(baseCol);   m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0.0; }
  }
  c.mesh.material.needsUpdate=true;
}

// Differenze a cascata
function computePyramidValues(top5){
  const vals=[]; vals[0]=top5.slice();
  for(let r=1;r<rows.length;r++){
    const p=vals[r-1], now=[];
    for(let i=0;i<p.length-1;i++) now.push(Math.abs(p[i]-p[i+1]));
    vals[r]=now;
  }
  return vals;
}
function applyValuesAndCheck(top5){
  const vals=computePyramidValues(top5);
  for(let i=0;i<cubes.length;i++) setHighlight(i,false);
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), vals[0][c]);
  const posByDiff={};
  for(let r=1;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const idx=linearIndex(r,c), v=vals[r][c];
      setCubeNumber(idx, v);
      (posByDiff[v] ||= []).push(idx);
    }
  }
  const dup=Object.keys(posByDiff).filter(k=>posByDiff[k].length>1);
  dup.forEach(k=>posByDiff[k].forEach(i=>setHighlight(i,true)));
  const unique=10 - dup.reduce((a,k)=>a+(posByDiff[k].length-1),0);
  setStatus(unique);
  if(dup.length===0) toast('🎉 Differenze tutte uniche! Completato.');
}

function linearIndex(row,col){ let i=0; for(let r=0;r<row;r++) i+=rows[r]; return i+col; }
function randomTop5(){
  const pool=Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  return pool.slice(0,5);
}

// Picking solo riga top
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pick(mx,my){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((mx-r.left)/r.width)*2-1; ndc.y=-((my-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(scene.children,true);
  for(const h of hits){ const m=h.object; if(m?.userData?.row===0) return m; }
  return null;
}
function handlePointerDown(e){
  const t=e.touches?e.touches[0]:e;
  const target=pick(t.clientX,t.clientY); if(!target) return;
  if(selected===target){ selected=null; toast('Deselezionato'); return; }
  if(!selected){ selected=target; toast('Selezionato. Tocca un altro cubo (top) per scambiare.'); }
  else{
    const a=cubes.findIndex(x=>x.mesh===selected), b=cubes.findIndex(x=>x.mesh===target);
    const av=cubes[a].value, bv=cubes[b].value;
    setCubeNumber(a,bv); setCubeNumber(b,av);
    selected=null;
    const newTop=[]; for(let c=0;c<5;c++) newTop.push(cubes[linearIndex(0,c)].value);
    applyValuesAndCheck(newTop);
  }
}
renderer.domElement.addEventListener('mousedown', handlePointerDown, {passive:true});
renderer.domElement.addEventListener('touchstart', handlePointerDown, {passive:true});

// Disattivo orbita per tenere la vista frontale sempre centrata (meglio per mobile).

// UI
$('#btn-shuffle').addEventListener('click', ()=>{
  topValues=randomTop5();
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
  applyValuesAndCheck(topValues);
  toast('Top mescolato');
});
$('#btn-reset').addEventListener('click', ()=>{
  topValues=[1,2,3,4,5];
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
  applyValuesAndCheck(topValues);
  toast('Reset completato');
});
$('#btn-help').addEventListener('click', ()=>toast('Regola: con 5 numeri (1–15), le 10 differenze sottostanti devono essere tutte diverse.'));

// Start
buildScene();
topValues=randomTop5();
for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
applyValuesAndCheck(topValues);
fitCamera();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();