(()=>{'use strict';

/* ---------- setup scena ---------- */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 18, 40);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.touchAction = 'none'; // per iPhone: niente scroll/zoom di Safari
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(10,20,16); scene.add(dir);

function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ---------- util ---------- */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const range = (n,off=0)=>Array.from({length:n},(_,i)=>i+off);

function hsvToRgb(h, s, v){
  const f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0);
  return [f(5),f(3),f(1)].map(x=>Math.round(x*255));
}
const NUM_COL = id=>{
  const h=(id-1)/15, s=.60, v=.95;
  const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|b;
};

/* ---------- materiali con numero su tutte le facce ---------- */
function makeNumberTexture(num, bgHex){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  // sfondo colorato
  g.fillStyle = '#'+bgHex.toString(16).padStart(6,'0');
  g.fillRect(0,0,256,256);
  // numero bianco
  g.fillStyle = '#ffffff';
  g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText(String(num), 128, 138);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; t.needsUpdate=true;
  return t;
}
function matsFor(num){
  const color = NUM_COL(num);
  const tx = makeNumberTexture(num,color);
  // Basic: non risente delle luci -> numeri leggibili
  const m = new THREE.MeshBasicMaterial({ map: tx });
  return [m,m,m,m,m,m];
}

/* ---------- geometria piramide (5,4,3,2,1) ---------- */
const ROWS = [5,4,3,2,1];           // elementi per riga (piramide “matematica”)
const STEP_X = 3.6;                 // spaziatura orizzontale
const STEP_Y = 3.6;                 // spaziatura verticale (punta verso il basso)
const SIZE   = 3.2;                  // lato cubo
const GEO    = new THREE.BoxGeometry(SIZE,SIZE,SIZE);

const root = new THREE.Group(); scene.add(root);

// Top row (5 numeri) – all’avvio 1..5 in ordine
let topRow = [1,2,3,4,5];           // sempre valori 1..15 senza duplicati idealmente
let cubes = [];                     // tutti i cubi (Mesh e meta)

function posFor(row /*0..4*/, idx /*0..ROWS[row]-1*/){
  const N = ROWS[row];
  const x = (idx - (N-1)/2) * STEP_X;
  const y = -row * STEP_Y;
  return new THREE.Vector3(x,y,0);
}

/* ricomputa tutte le righe dalle differenze assolute */
function computeRows(){
  const rows = [ topRow.slice() ];
  for(let r=1; r<ROWS.length; r++){
    const prev = rows[r-1];
    const cur = [];
    for(let i=0; i<prev.length-1; i++){
      cur.push( Math.abs(prev[i] - prev[i+1]) );
    }
    rows.push(cur);
  }
  return rows; // 5 righe: 5,4,3,2,1 elementi
}

function clearRoot(){
  while(root.children.length) root.remove(root.children[0]);
  cubes.length = 0;
}

function buildScene(){
  clearRoot();
  const rows = computeRows();
  for(let r=0; r<ROWS.length; r++){
    for(let i=0; i<ROWS[r]; i++){
      const val = rows[r][i];
      const m = new THREE.Mesh(GEO, matsFor(val));
      m.position.copy(posFor(r,i));
      m.userData = { row:r, col:i, value:val };
      m.castShadow = m.receiveShadow = false;
      root.add(m);
      cubes.push(m);

      // Solo la riga alta è editabile
      if(r===0){
        m.cursor='pointer';
        m.onClick = ()=> setValueAt(i, pendingNumber ?? null);
      }
    }
  }
  updateStatus();
  renderer.render(scene,camera);
}

/* ---------- stato / UI ---------- */
const $ = sel => document.querySelector(sel);
const statusEl = $('#status');
function updateStatus(){
  // conteggio differenze uniche (le 10 nella piramide sotto la riga alta)
  const rows = computeRows();
  const diffs = rows.slice(1).flat();   // 4+3+2+1 = 10
  const uniq  = new Set(diffs.filter(v=>Number.isFinite(v)));
  statusEl.textContent = `${uniq.size}/10`;
  highlight(diffs);
}

// evidenzia i duplicati (cubi delle righe sotto) in rosso
function highlight(diffsFlat){
  const seen = new Map();
  diffsFlat.forEach((v,idx)=>{
    if(!seen.has(v)) seen.set(v, [idx]);
    else seen.get(v).push(idx);
  });

  // mappa (row>0) -> indice lineare nella lista diffs (riga 1 => 0..3, riga 2 => 4..6, ecc.)
  const rBase = [0,0,4,7,9]; // partenza per riga 1..4 in flat (precalcolata)
  cubes.forEach(mesh=>{
    if(mesh.userData.row===0){
      mesh.material.forEach(mm=>mm.color && (mm.color.set(0xffffff))); // numero resta bianco; niente alone
      return;
    }
    const r = mesh.userData.row;         // 1..4
    const i = mesh.userData.col;         // 0..len-1
    const linear = rBase[r] + i;
    const val = mesh.userData.value;

    const dup = seen.get(val) && seen.get(val).length>1;
    // “bordo”/alone rosso semplice: sovrascriviamo la texture con testata rossa se duplicato
    if(dup){
      const color = 0xff3b30;                // rosso
      const tx = makeNumberTexture(val, color);
      mesh.material.forEach((m,k)=>{ m.map = tx; m.needsUpdate=true; });
    }else{
      const tx = makeNumberTexture(val, NUM_COL(val));
      mesh.material.forEach((m,k)=>{ m.map = tx; m.needsUpdate=true; });
    }
  });
}

/* set value (1..15) su colonna i della riga alta; se num==null usa prompt */
function setValueAt(i, viaPalette){
  let v = viaPalette;
  if(v==null){
    const s = prompt('Numero (1..15) per la posizione '+(i+1), topRow[i]);
    if(s==null) return;
    v = parseInt(s,10);
  }
  if(!Number.isFinite(v) || v<1 || v>15) { alert('Inserisci un intero tra 1 e 15'); return; }
  topRow[i] = v;
  buildScene();
}

/* ---------- paletta (1..15) ---------- */
const palette = document.getElementById('palette');
let pendingNumber = null;
function buildPalette(){
  palette.textContent='';
  range(15,1).forEach(n=>{
    const d=document.createElement('div');
    d.className='pill';
    d.textContent=String(n);
    d.style.background = '#fff';
    d.style.color = '#000';
    d.style.borderColor = '#'+NUM_COL(n).toString(16).padStart(6,'0');
    d.addEventListener('click', ()=>{
      pendingNumber = (pendingNumber===n)? null : n;
      [...palette.children].forEach(el=>el.classList.remove('active'));
      if(pendingNumber!=null) d.classList.add('active');
    });
    palette.appendChild(d);
  });
}
buildPalette();

/* ---------- interazione orbit (touch/mouse) ---------- */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  dragging=true; px=e.clientX; py=e.clientY; renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', e=>{
  dragging=false; renderer.domElement.releasePointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  root.rotation.y += dx; root.rotation.x = clamp(root.rotation.x+dy, -1.2, 1.2);
  px=e.clientX; py=e.clientY;
});

/* picking click per edit riga alta */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickTopAt(clientX, clientY){
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX-rect.left)/rect.width)*2-1;
  ndc.y = -((clientY-rect.top)/rect.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(root.children, false);
  for(const h of hits){
    const o=h.object, ud=o.userData;
    if(ud && ud.row===0) return o; // solo riga alta
  }
  return null;
}
renderer.domElement.addEventListener('click', e=>{
  const hit = pickTopAt(e.clientX, e.clientY);
  if(hit) setValueAt(hit.userData.col, pendingNumber ?? null);
});

/* ---------- controlli ---------- */
document.getElementById('btn-reset').addEventListener('click', ()=>{
  root.rotation.set(0,0,0);
  topRow = [1,2,3,4,5];
  pendingNumber = null;
  [...palette.children].forEach(el=>el.classList.remove('active'));
  buildScene();
});

document.getElementById('btn-shuffle').addEventListener('click', ()=>{
  // 5 numeri unici tra 1..15
  const bag = range(15,1);
  for(let i=bag.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [bag[i],bag[j]]=[bag[j],bag[i]]; }
  topRow = bag.slice(0,5);
  pendingNumber = null;
  [...palette.children].forEach(el=>el.classList.remove('active'));
  buildScene();
});

/* ---------- loop ---------- */
function repaint(){ renderer.render(scene,camera); requestAnimationFrame(repaint); }
buildScene(); repaint();

})();
