(()=>{'use strict';
/**
 * Piramide Matematica 3D — base 5 in alto, 4-3-2-1 sotto (punta in basso)
 * - Solo la riga TOP (5 cubi) è interattiva (swap valori).
 * - Righe sottostanti = differenze assolute in cascata.
 * - Evidenzia in rosso tutte le celle coinvolte in differenze duplicate.
 */

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 7.8, 20);   // un po’ più alto e distante così si vede tutta la base da 5
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.98));

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); renderer.render(scene,camera);
}
window.addEventListener('resize', onResize, {passive:true}); onResize();

// ---------- configurazione piramide
const rows = [5,4,3,2,1];            // <<< BASE 5 IN ALTO
const maxRow = rows[0];               // 5
const stepX  = 2.2;                   // passo orizzontale
const stepY  = 2.2;                   // passo verticale
const FACE_BG = '#24304a';

const GEO = new THREE.BoxGeometry(1.6, 1.6, 1.6);

// palette 15 colori
function hsvToRgb(h, s, v) {
  let f = (n, k=(n+h*6)%6) => v - v*s*Math.max(Math.min(k,4-k,1),0);
  return [f(5), f(3), f(1)].map(x=>Math.round(x*255));
}
const COLORS = Array.from({length:15}, (_,i)=>{
  const h = i/15, s=0.55, v=0.95;
  const [r,g,b] = hsvToRgb(h,s,v);
  return (r<<16)|(g<<8)|(b);
});

// stato
const cubes = []; // {mesh,row,col,value,mats[]}
let topValues = [];
let selected = null;
let toastTimer = null;

// UI helpers
const $ = s => document.querySelector(s);
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'), 1800);
}
function setStatus(okCount){ $('#status').innerHTML = `Differenze uniche: <b>${okCount}/10</b>`; }

// textures numeri (solo faccia +Z)
function makeNumberTexture(num, fg="#fff", bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const ctx=c.getContext('2d');
  ctx.fillStyle=bg; ctx.fillRect(0,0,256,256);
  ctx.fillStyle=fg; ctx.font="bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  if(num!=="" && num!=null) ctx.fillText(num, 128, 142);
  const tx = new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true;
  return tx;
}
function buildMaterials(colorHex, num){
  const base = new THREE.MeshLambertMaterial({ color: colorHex });
  const mats = [base.clone(),base.clone(),base.clone(),base.clone(),base.clone(),base.clone()];
  mats[4] = new THREE.MeshBasicMaterial({ map: makeNumberTexture(num,"#fff",FACE_BG) }); // +Z frontale
  return mats;
}

// posizionamento CENTRATO rispetto alla riga massima (5)
function positionFor(row, col){
  const count = rows[row];                 // cubi in questa riga
  const totalWidthMax = (maxRow-1)*stepX;  // larghezza della base da 5
  const thisWidth     = (count-1)*stepX;
  // margine a sinistra per centrare la riga count dentro la base da 5
  const left = -totalWidthMax/2 + ( (totalWidthMax-thisWidth)/2 );
  const x = left + col*stepX;
  const y = (rows.length-1 - row) * stepY; // base in alto (y maggiore), punta in basso (y minore)
  return new THREE.Vector3(x,y,0);
}

// index lineare
function linearIndex(row,col){ let idx=0; for(let r=0;r<row;r++) idx+=rows[r]; return idx+col; }

// build scena
function buildScene(){
  for(const c of cubes){ scene.remove(c.mesh); }
  cubes.length = 0;
  let idx=0;
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const mats = buildMaterials(COLORS[idx%COLORS.length], "");
      const mesh = new THREE.Mesh(GEO, mats);
      mesh.position.copy(positionFor(r,c));
      mesh.userData = {row:r,col:c,index:idx,isTop:r===0};
      scene.add(mesh);
      cubes.push({mesh,row:r,col:c,value:0,mats});
      idx++;
    }
  }
}
function setCubeNumber(i,num){
  const c = cubes[i];
  c.value = num;
  c.mats[4].map?.dispose();
  c.mats[4].dispose?.();
  c.mats[4] = new THREE.MeshBasicMaterial({ map: makeNumberTexture(num||"","#fff",FACE_BG) });
  c.mesh.material = c.mats;
  c.mesh.material.needsUpdate = true;
}
function setHighlight(i,on){
  const c = cubes[i]; const baseCol = COLORS[i%COLORS.length];
  for(let f=0; f<6; f++){
    if(f===4) continue;           // non tocco la faccia col numero
    const m=c.mats[f];
    if(on){ m.color.setHex(0x9b1c1c); m.emissive=new THREE.Color(0x300000); m.emissiveIntensity=0.6; }
    else { m.color.setHex(baseCol);   m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0.0; }
  }
  c.mesh.material.needsUpdate=true;
}

// differenze a cascata
function computePyramidValues(top5){
  const vals=[]; vals[0]=top5.slice();      // [5]
  for(let r=1;r<rows.length;r++){
    const prev=vals[r-1], now=[];
    for(let i=0;i<prev.length-1;i++) now.push(Math.abs(prev[i]-prev[i+1]));
    vals[r]=now;
  }
  return vals; // [5,4,3,2,1]
}
function applyValuesAndCheck(top5){
  const vals=computePyramidValues(top5);
  // reset highlight
  for(let i=0;i<cubes.length;i++) setHighlight(i,false);
  // top
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), vals[0][c]);
  // sotto + raccolta duplicati
  const posByDiff={};
  for(let r=1;r<rows.length;r++){
    for(let c=0;c<rows[r];c++){
      const idx=linearIndex(r,c), val=vals[r][c];
      setCubeNumber(idx,val);
      (posByDiff[val] ||= []).push(idx);
    }
  }
  const dupVals = Object.keys(posByDiff).filter(k => posByDiff[k].length>1);
  dupVals.forEach(k => posByDiff[k].forEach(i=>setHighlight(i,true)));

  // quante differenze “uniche” su 10?
  const uniqueCount = 10 - dupVals.reduce((acc,k)=> acc+(posByDiff[k].length-1),0);
  setStatus(uniqueCount);
  if(dupVals.length===0) toast("🎉 Differenze tutte uniche! Completato.");
}

// top random 5 distinte 1..15
function randomTop5(){
  const pool=Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  return pool.slice(0,5);
}

// picking solo top row
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pick(mx,my){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x=((mx-r.left)/r.width)*2-1; ndc.y=-((my-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(scene.children, true);
  for(const h of hits){
    const m=h.object; if(!m || !m.userData) continue;
    if(m.userData.row===0) return m;
  }
  return null;
}
function handlePointerDown(e){
  const t=e.touches?e.touches[0]:e;
  const target=pick(t.clientX,t.clientY); if(!target) return;
  if(selected===target){ selected=null; toast("Deselezionato"); return; }
  if(!selected){ selected=target; toast("Selezionato. Tocca un altro cubo (top) per scambiare."); }
  else{
    const aIdx=cubes.findIndex(c=>c.mesh===selected);
    const bIdx=cubes.findIndex(c=>c.mesh===target);
    const aVal=cubes[aIdx].value, bVal=cubes[bIdx].value;
    setCubeNumber(aIdx,bVal); setCubeNumber(bIdx,aVal);
    selected=null;
    const newTop=[]; for(let c=0;c<5;c++) newTop.push(cubes[linearIndex(0,c)].value);
    applyValuesAndCheck(newTop);
  }
}
renderer.domElement.addEventListener('mousedown', handlePointerDown, {passive:true});
renderer.domElement.addEventListener('touchstart', handlePointerDown, {passive:true});

// orbita semplice con tasto destro
let orbit=false, lx=0, ly=0;
function onMove(e){
  const t=e.touches?e.touches[0]:e;
  if(!orbit) return;
  const dx=(t.clientX-lx)/140, dy=(t.clientY-ly)/140;
  scene.rotation.y+=dx; scene.rotation.x+=dy;
  lx=t.clientX; ly=t.clientY;
}
renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());
renderer.domElement.addEventListener('pointerdown', e=>{ if(e.button===2){ orbit=true; lx=e.clientX; ly=e.clientY; } });
window.addEventListener('pointerup', ()=> orbit=false);
window.addEventListener('pointermove', onMove);

// UI
$('#btn-shuffle').addEventListener('click', ()=>{
  topValues = randomTop5();
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
  applyValuesAndCheck(topValues);
  toast("Top mescolato");
});
$('#btn-reset').addEventListener('click', ()=>{
  topValues = [1,2,3,4,5];
  for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
  applyValuesAndCheck(topValues);
  toast("Reset completato");
});
$('#btn-help').addEventListener('click', ()=>{
  toast("Regola: con 5 numeri (1–15), le 10 differenze sottostanti devono essere tutte diverse.");
});

// bootstrap
buildScene();
topValues = randomTop5();
for(let c=0;c<5;c++) setCubeNumber(linearIndex(0,c), topValues[c]);
applyValuesAndCheck(topValues);

(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();
})(); 
