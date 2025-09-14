(()=>{'use strict';

// ---------- scena ----------
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 30, 55);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.touchAction = 'none'; // iOS: abilita drag pointer
stage.appendChild(renderer.domElement);

// luci
scene.add(new THREE.AmbientLight(0xffffff, 1));
const key = new THREE.DirectionalLight(0xffffff, .35);
key.position.set(12,20,14); scene.add(key);

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

// ---------- geometria ----------
const STEP=2.4, STEP_Y=2.4, SIZE=2.3;
const GEO = new THREE.BoxGeometry(SIZE,SIZE,SIZE);
const LAYERS = [5,4,3,2,1];

function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const FACE_COLORS = Array.from({length:15},(_,i)=>{ const h=i/15, s=0.55, v=0.85; const [r,g,b]=hsvToRgb(h,s,v); return `rgb(${r},${g},${b})`; });

// numeri su tutte le facce
function makeNumberTexture(num, bg){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle='#ffffff'; g.font='bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText(num,128,144);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; t.needsUpdate=true; return t;
}
function matsFor(num){
  const bg = FACE_COLORS[(num-1)%15];
  const tx = makeNumberTexture(num, bg);
  const m  = new THREE.MeshBasicMaterial({ map: tx });
  return [m,m,m,m,m,m];
}

const root=new THREE.Group(); scene.add(root);
const cubes=[];

function clearRoot(){ while(root.children.length) root.remove(root.children[0]); cubes.length=0; }

// posizioni (vista matematica)
function posForMath(row,col){
  const sizes=[5,4,3,2,1];
  const N = sizes[row];
  const x = (col-(N-1)/2)*STEP;
  const y = -row*STEP_Y;
  const z = 0;
  return new THREE.Vector3(x,y,z);
}

// costruzione iniziale (riga alta 1..5)
const TOP_DEFAULT=[1,2,3,4,5];
function buildMath(topRow=TOP_DEFAULT){
  clearRoot();
  const rows=[topRow.slice()];
  for(let r=1;r<5;r++){
    const prev=rows[r-1], cur=[];
    for(let i=0;i<prev.length-1;i++) cur.push(Math.abs(prev[i]-prev[i+1]));
    rows.push(cur);
  }
  for(let r=0;r<rows.length;r++){
    for(let c=0;c<rows[r].length;c++){
      const v = clamp15(rows[r][c]);
      const mesh = new THREE.Mesh(GEO, matsFor(v));
      mesh.position.copy(posForMath(r,c));
      mesh.userData={row:r,col:c,value:v,mode:'math'};
      root.add(mesh); cubes.push(mesh);
    }
  }
  checkUniqueness();
}

function clamp15(n){ n=Number(n)||1; return Math.max(1,Math.min(15, n)); }

// ---------- palette ----------
const palette = document.getElementById('palette');
let selectedN = 1;

function buildPalette(){
  palette.innerHTML='';
  for(let n=1;n<=15;n++){
    const b=document.createElement('button');
    b.type='button'; b.className='chip'; b.textContent=n;
    if(n===selectedN) b.classList.add('sel');
    b.addEventListener('click', ()=>{
      selectedN=n;
      [...palette.children].forEach(x=>x.classList.remove('sel'));
      b.classList.add('sel');
    }, {passive:true});
    palette.appendChild(b);
  }
}

// ---------- ricomputo ----------
function setValueAtTop(col, val){
  const mesh=cubes.find(m=>m.userData.mode==='math'&&m.userData.row===0&&m.userData.col===col);
  if(!mesh) return;
  const vv=clamp15(val);
  mesh.userData.value = vv;
  const mats = matsFor(vv);
  for(let i=0;i<6;i++) mesh.material[i]=mats[i];
  mesh.material.needsUpdate=true;
  recomputeBelow();
}

function recomputeBelow(){
  const top = cubes
    .filter(m=>m.userData.row===0)
    .sort((a,b)=>a.userData.col-b.userData.col)
    .map(m=>m.userData.value);

  const rows=[top.slice()];
  for(let r=1;r<5;r++){
    const prev=rows[r-1], cur=[];
    for(let i=0;i<prev.length-1;i++) cur.push(Math.abs(prev[i]-prev[i+1]));
    rows.push(cur);
  }

  for(let r=1;r<rows.length;r++){
    for(let c=0;c<rows[r].length;c++){
      const v=clamp15(rows[r][c]);
      const mesh=cubes.find(m=>m.userData.row===r&&m.userData.col===c);
      if(mesh){
        mesh.userData.value=v;
        const mats=matsFor(v);
        for(let i=0;i<6;i++) mesh.material[i]=mats[i];
        mesh.material.needsUpdate=true;
      }
    }
  }
  checkUniqueness();
}

function checkUniqueness(){
  const all=[];
  for(let r=1;r<=4;r++){
    cubes.filter(m=>m.userData.row===r)
         .sort((a,b)=>a.userData.col-b.userData.col)
         .forEach(m=>all.push(m.userData.value));
  }
  const set=new Set(all);
  setStatus(`Differenze uniche: ${set.size}/10`);
}

function setStatus(t){ const s=document.getElementById('status'); if(s) s.innerHTML=t; }

// ---------- input: drag vs tap ----------
let dragging=false, sx=0, sy=0, moved=false;

renderer.domElement.addEventListener('pointerdown', (e)=>{
  dragging=true; moved=false; sx=e.clientX; sy=e.clientY;
}, {passive:true});

renderer.domElement.addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  const dx=(e.clientX-sx), dy=(e.clientY-sy);
  if(Math.hypot(dx,dy)>8) moved=true;        // soglia TAP
  if(moved){
    root.rotation.y += dx/140;
    root.rotation.x += dy/140;
    sx=e.clientX; sy=e.clientY;
  }
}, {passive:true});

addEventListener('pointerup', (e)=>{
  if(!dragging) return;
  dragging=false;
  if(!moved){
    // TAP → assegna numero al cubo top row se colpito
    const t = pick(e.clientX, e.clientY);
    if(t && t.userData && t.userData.row===0){
      setValueAtTop(t.userData.col, selectedN);
    }
  }
}, {passive:true});

// touchend extra (alcuni browser mobili inviano solo touchend)
renderer.domElement.addEventListener('touchend', (e)=>{
  const t=e.changedTouches&&e.changedTouches[0]; if(!t) return;
  const hit=pick(t.clientX,t.clientY);
  if(hit && hit.userData && hit.userData.row===0){
    setValueAtTop(hit.userData.col, selectedN);
  }
}, {passive:true});

// raycast helper
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pick(cx,cy){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((cx-r.left)/r.width)*2-1; ndc.y=-((cy-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children,true);
  if(!hits.length) return null;
  let o=hits[0].object; while(o && o.parent && o.parent!==root){ o=o.parent; }
  return o;
}

// ---------- bottoni ----------
document.getElementById('btn-shuffle')?.addEventListener('click', ()=>{
  // assegna 5 numeri casuali alla riga alta
  for(let c=0;c<5;c++) setValueAtTop(c, 1 + (Math.random()*15|0));
}, {passive:true});

document.getElementById('btn-reset')?.addEventListener('click', ()=>{
  root.rotation.set(0,0,0);
  TOP_DEFAULT.forEach((v,c)=>setValueAtTop(c, v));
}, {passive:true});

// ---------- avvio ----------
buildPalette();
buildMath(); // parte 1,2,3,4,5

// loop
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
