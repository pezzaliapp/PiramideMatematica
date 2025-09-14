(()=>{'use strict';

/* ---------- setup base ---------- */
const stage = document.getElementById('stage');
if(!stage){ console.error('#stage mancante'); return; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, 12, 26);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci
scene.add(new THREE.AmbientLight(0xffffff, .95));
const dir = new THREE.DirectionalLight(0xffffff, .35);
dir.position.set(6,12,10);
scene.add(dir);

// util UI
const $ = s => document.querySelector(s);
const statusEl = $('#status');
const setStatus = n => { if(statusEl) statusEl.innerHTML = `Differenze uniche: <b>${n}/10</b>`; };

// dimensioni
const ROWS = [5,4,3,2,1];
const STEP_X = 2.1, STEP_Y = 2.2, STEP_Z = 1.2;
const CUBE   = 2.08;
const GEO    = new THREE.BoxGeometry(CUBE,CUBE,CUBE);
const FACE_BG = '#1b2538';

// colori diversi per cubo
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLORS = Array.from({length:15},(_,i)=>{ const h=i/15,s=0.6,v=0.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|(b); });

/* ---------- numeri su facce ---------- */
function makeNumberTexture(num, fg='#fff', bg=FACE_BG){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  if(num!=='' && num!=null) g.fillText(num,128,142);
  const tx=new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}
function matsFor(value, colorHex){
  const tx = makeNumberTexture(value,'#fff',FACE_BG);
  const m  = new THREE.MeshLambertMaterial({color:colorHex, map:tx});
  return [m.clone(),m.clone(),m.clone(),m.clone(),m.clone(),m.clone()];
}

/* ---------- posizione centrata ---------- */
function positionFor(row,col){
  const n = ROWS[row];
  const x = (col - (n-1)/2) * STEP_X;
  const y = (((ROWS.length-1)/2) - row) * STEP_Y;
  const z = (row - (ROWS.length-1)/2) * STEP_Z;
  return new THREE.Vector3(x,y,z);
}
function lin(row,col){ let i=0; for(let r=0;r<row;r++) i+=ROWS[r]; return i+col; }

/* ---------- stato ---------- */
const cubes=[]; // {mesh,row,col,value,mats}

/* ---------- costruzione piramide ---------- */
function build(topValues){
  // pulizia oggetti mesh
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i]; if(o.isMesh) scene.remove(o);
  }
  cubes.length=0;

  // se non passo top, crea 5 numeri casuali (distinti) 1..15
  if(!topValues){
    const pool = Array.from({length:15},(_,i)=>i+1);
    for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
    topValues = pool.slice(0,5);
  }

  // calcola righe inferiori = differenze
  const valuesByRow=[topValues];
  for(let r=1;r<ROWS.length;r++){
    const above=valuesByRow[r-1], row=[];
    for(let c=0;c<above.length-1;c++) row.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=row;
  }

  // crea 15 cubi
  let k=0;
  for(let r=0;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const val = valuesByRow[r][c];
      const mats = matsFor(val, COLORS[k%COLORS.length]);
      const mesh = new THREE.Mesh(GEO, mats);
      mesh.position.copy(positionFor(r,c));
      mesh.userData = {row:r,col:c};
      scene.add(mesh);
      cubes.push({mesh,row:r,col:c,value:val,mats});
      k++;
    }
  }
  fitCamera();
  checkUniqueness();
}

/* ---------- aggiornamenti ---------- */
function setValueAt(row,col,val){
  const idx = lin(row,col), cube=cubes[idx];
  cube.value = val;
  for(let f=0; f<6; f++){
    cube.mats[f].map?.dispose?.();
    cube.mats[f].map = makeNumberTexture(val,'#fff',FACE_BG);
    cube.mats[f].needsUpdate=true;
  }
  cube.mesh.material=cube.mats;
}

function recomputeBelow(){
  const top=[]; for(let c=0;c<5;c++) top.push(cubes[lin(0,c)].value);
  const valuesByRow=[top];
  for(let r=1;r<ROWS.length;r++){
    const above=valuesByRow[r-1], row=[];
    for(let c=0;c<above.length-1;c++) row.push(Math.abs(above[c]-above[c+1]));
    valuesByRow[r]=row;
  }
  for(let r=1;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      setValueAt(r,c, valuesByRow[r][c]);
    }
  }
}

function highlight(idx,on){
  const baseCol=COLORS[idx%COLORS.length];
  const cube=cubes[idx];
  for(let f=0; f<6; f++){
    const m=cube.mats[f];
    if(on){ m.color.setHex(0xc0392b); m.emissive=new THREE.Color(0x330000); m.emissiveIntensity=.7; }
    else { m.color.setHex(baseCol);   m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0; }
    m.needsUpdate=true;
  }
}

// controlla le 10 differenze (righe 1..4) siano tutte uniche
function checkUniqueness(){
  const posByVal={};
  for(let r=1;r<ROWS.length;r++){
    for(let c=0;c<ROWS[r];c++){
      const idx=lin(r,c), v=cubes[idx].value;
      (posByVal[v] ||= []).push(idx);
    }
  }
  // clear
  for(let i=0;i<cubes.length;i++) highlight(i,false);
  // dup
  let duplicates = 0;
  for(const k in posByVal){
    if(posByVal[k].length>1){
      duplicates += posByVal[k].length-1;
      posByVal[k].forEach(i=>highlight(i,true));
    }
  }
  const unique = 10 - duplicates;
  setStatus(unique);
}

/* ---------- interazione top (swap a coppie) ---------- */
const ray = new THREE.Raycaster(), ndc=new THREE.Vector2();
function pickTop(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((x-r.left)/r.width)*2-1; ndc.y= -((y-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(scene.children,true);
  for(const h of hits){
    let m=h.object; while(m && !m.userData?.hasOwnProperty('row')) m=m.parent;
    if(m && m.userData.row===0) return m;
  }
  return null;
}
let selected=null;
function onTopPointer(e){
  const t=e.touches?e.touches[0]:e;
  const hit=pickTop(t.clientX,t.clientY);
  if(!hit) return;
  if(!selected){ selected=hit; return; }
  if(selected===hit){ selected=null; return; }
  const ia = lin(0, selected.userData.col);
  const ib = lin(0, hit.userData.col);
  const av=cubes[ia].value, bv=cubes[ib].value;
  setValueAt(0, selected.userData.col, bv);
  setValueAt(0, hit.userData.col, av);
  selected=null;
  recomputeBelow();
  checkUniqueness();
}
renderer.domElement.addEventListener('mousedown', onTopPointer, {passive:true});
renderer.domElement.addEventListener('touchstart', onTopPointer, {passive:true});

// drag rotazione sullo sfondo
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  if(!pickTop(e.clientX,e.clientY)){ dragging=true; px=e.clientX; py=e.clientY; }
});
addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y+=dx; scene.rotation.x+=dy;
  px=e.clientX; py=e.clientY;
});
addEventListener('pointerup', ()=> dragging=false);

/* ---------- camera fit + resize ---------- */
function fitCamera(){
  const box = new THREE.Box3();
  for(const o of scene.children){ if(o.isMesh) box.expandByObject(o); }
  if(box.isEmpty()) return;

  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);

  const maxSize = Math.max(size.x,size.y,size.z);
  const fov = camera.fov * Math.PI/180;
  let dist = (maxSize/2) / Math.tan(fov/2);
  dist *= 1.25;

  const dir = new THREE.Vector3(0,0,1); // guarda “da davanti”
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
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

/* ---------- bottoni ---------- */
$('#btn-reset')?.addEventListener('click', ()=>{
  const top=[1,2,3,4,5];
  for(let c=0;c<5;c++) setValueAt(0,c, top[c]);
  recomputeBelow();
  checkUniqueness();
});

$('#btn-shuffle')?.addEventListener('click', ()=>{
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const top = pool.slice(0,5);
  for(let c=0;c<5;c++) setValueAt(0,c, top[c]);
  recomputeBelow();
  checkUniqueness();
});

/* ---------- start ---------- */
build();          // costruisce piramide + fit + stato
onResize();       // primo layout certo

(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

console.log('Piramide3D: init ok');

})();
