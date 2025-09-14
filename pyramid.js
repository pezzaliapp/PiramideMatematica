(()=>{'use strict';

/* ====== DOM ====== */
const stage = document.getElementById('stage');
const banner = document.getElementById('banner');
const btnShuffle = document.getElementById('btn-shuffle');
const btnReset   = document.getElementById('btn-reset');
const statusEl   = document.getElementById('status');

/* ====== Three.js setup ====== */
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // sfondo bianco

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci (gli sticker sono Basic; lasciamo luci per eventuali abbellimenti)
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dir = new THREE.DirectionalLight(0xffffff, 0.35);
dir.position.set(10,20,14); scene.add(dir);

function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true});
onResize();

/* ====== Piramide 5×5 → 1×1 ====== */
const LAYERS = [5,4,3,2,1];       // base in alto → punta in basso
const STEP   = 2.2;               // passo griglia X/Z
const STEP_Y = 2.2;               // distanza verticale layer
const SIZE   = 2.18;              // lato cubo
const GEO    = new THREE.BoxGeometry(SIZE,SIZE,SIZE);

// posizionamento centrato
function posFor(layer,i,j){
  const N = LAYERS[layer];
  const x = (i - (N-1)/2)*STEP;
  const z = (j - (N-1)/2)*STEP;
  const y = -layer*STEP_Y; // base in alto (y=0), scende verso la punta
  return new THREE.Vector3(x,y,z);
}

/* ====== Colori e texture numeri (su tutte le 6 facce) ====== */
function hsvToRgb(h,s,v){
  let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0);
  const r=Math.round(f(5)*255), g=Math.round(f(3)*255), b=Math.round(f(1)*255);
  return (r<<16)|(g<<8)|b;
}
const COLS = Array.from({length:15},(_,i)=>hsvToRgb(i/15, .55, .95)); // 15 colori

// cache texture: `${num}-${hex}` o `${num}-${hex}-bad`
const TEX_CACHE = new Map();

function numberTexture(num, bgHex, withBorder=false){
  const key = `${num}-${bgHex}${withBorder?'-bad':''}`;
  const cached = TEX_CACHE.get(key);
  if(cached) return cached;

  // base: numero su sfondo colorato
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');

  const r=(bgHex>>16)&255, gC=(bgHex>>8)&255, b=bgHex&255;
  g.fillStyle=`rgb(${r},${gC},${b})`;
  g.fillRect(0,0,256,256);

  g.fillStyle='#ffffff';
  g.textAlign='center'; g.textBaseline='middle';
  const text=String(num??''); const fontSize=(text.length>=2)?150:170;
  g.font=`bold ${fontSize}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
  g.fillText(text,128,140);

  if(withBorder){
    g.lineWidth=12; g.strokeStyle='#c0392b';
    g.strokeRect(6,6,244,244);
  }

  const tex=new THREE.CanvasTexture(c);
  tex.anisotropy=4; tex.needsUpdate=true;
  TEX_CACHE.set(key, tex);
  return tex;
}

function matsFor(value, colorHex, bad=false){
  const t = numberTexture(value, colorHex, bad);
  const m = new THREE.MeshBasicMaterial({ map:t });
  return [m.clone(),m.clone(),m.clone(),m.clone(),m.clone(),m.clone()];
}

/* ====== Stato numerico (top5 → differenze) ====== */
let top5 = [1,2,3,4,5];             // editabili dall’utente (click su layer 0)
const rows = Array.from({length:5},(_,i)=>Array(LAYERS[i]).fill(0));

function computeRows(){
  rows[0] = top5.slice(); // 5
  for(let l=1;l<LAYERS.length;l++){
    const prev=rows[l-1], cur=rows[l];
    for(let i=0;i<cur.length;i++){
      cur[i] = Math.abs(prev[i]-prev[i+1]);
    }
  }
}

/* ====== Costruzione cubi ====== */
const cubes = []; // {mesh, layer, i, j, colorHex, mats[]}

function buildScene(){
  // pulizia
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i];
    if(o.isMesh){ scene.remove(o); }
  }
  cubes.length=0;

  computeRows();

  for(let l=0; l<LAYERS.length; l++){
    const N=LAYERS[l];
    for(let i=0;i<N;i++){
      const val = rows[l][i];
      const colorHex = COLS[i % COLS.length];

      for(let j=0;j<N;j++){
        // gruppo: plastica + sticker numerati (6 facce)
        const group = new THREE.Group();

        const plastic = new THREE.Mesh(GEO, new THREE.MeshStandardMaterial({ color:0x20232c, metalness:0.1, roughness:0.6 }));
        group.add(plastic);

        const stickerGeo = GEO.clone(); stickerGeo.scale(0.995,0.995,0.995);
        const mats = matsFor(val, colorHex, false);
        const sticker = new THREE.Mesh(stickerGeo, mats);
        group.add(sticker);

        group.position.copy(posFor(l,i,j));
        group.userData = { layer:l, i, j };
        scene.add(group);
        cubes.push({ mesh:group, layer:l, i, j, colorHex, mats });
      }
    }
  }
  repaint(); // calcola e applica highlight/texture coerenti
}

/* ====== Repaint + Highlight ====== */
function setStatus(unique){ statusEl.innerHTML = `Differenze uniche: <b>${unique}/10</b>`; }

function repaint(){
  computeRows();

  // differenze = righe 1..4 (4+3+2+1 = 10)
  const diffs = rows[1].concat(rows[2],rows[3],rows[4]);
  const count = {}; diffs.forEach(v=>count[v]=(count[v]||0)+1);
  const badVals = new Set(); diffs.forEach(v=>{ if(v===0 || count[v]>1) badVals.add(v); });
  const unique = new Set(diffs.filter(v=>v>0)).size;
  setStatus(unique);

  // aggiorna texture di ogni cubo (tutte e 6 le facce)
  for(const c of cubes){
    const v = rows[c.layer][c.i];
    const bad = badVals.has(v);
    const tex = numberTexture(v, c.colorHex, bad);
    // sticker è child[1]
    const sticker = c.mesh.children[1];
    // sostituisco la map su ogni materiale
    const mats = sticker.material;
    for(let f=0; f<6; f++){
      if(mats[f].map !== tex){
        mats[f].map = tex; mats[f].needsUpdate = true;
      }
    }
  }
}

/* ====== Interazione: rotazione (mouse + touch) ====== */
let dragging=false, px=0, py=0;
function startDrag(x,y){ dragging=true; px=x; py=y; }
function moveDrag(x,y){
  if(!dragging) return;
  const dx=(x-px)/140, dy=(y-py)/140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px=x; py=y;
}
function endDrag(){ dragging=false; }

// mouse
renderer.domElement.addEventListener('mousedown', e=> startDrag(e.clientX,e.clientY));
addEventListener('mouseup', endDrag);
addEventListener('mousemove', e=> moveDrag(e.clientX,e.clientY));

// touch (iPhone/Android)
renderer.domElement.addEventListener('touchstart', e=>{
  if(e.touches.length===1){ const t=e.touches[0]; startDrag(t.clientX,t.clientY); }
},{passive:true});
renderer.domElement.addEventListener('touchmove', e=>{
  if(e.touches.length===1){ const t=e.touches[0]; moveDrag(t.clientX,t.clientY); }
},{passive:true});
renderer.domElement.addEventListener('touchend', endDrag);

/* ====== Inserimento numero (click su layer 0) ====== */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pick(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((x-r.left)/r.width)*2-1; ndc.y= -((y-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc, camera);
  const hits=ray.intersectObjects(scene.children,true);
  // risaliamo al gruppo-cubo
  for(const h of hits){
    let o=h.object;
    while(o && !o.userData) o=o.parent;
    if(o && o.userData) return o;
  }
  return null;
}

renderer.domElement.addEventListener('click', (e)=>{
  const o = pick(e.clientX, e.clientY);
  if(!o) return;
  const {layer,i} = o.userData;
  if(layer!==0) return; // edit solo top row
  const cur = top5[i];
  let v = prompt(`Numero (1..15) per la colonna ${i+1}:`, String(cur));
  if(v==null) return;
  v = parseInt(v,10);
  if(!Number.isFinite(v) || v<1 || v>15){ alert('Inserisci un intero tra 1 e 15.'); return; }
  top5[i]=v;
  repaint();
});

/* ====== Banner “Doppi clic per iniziare” ====== */
function hideBanner(){ banner?.classList.add('hide'); }
addEventListener('dblclick', hideBanner, {passive:true});
renderer.domElement.addEventListener('touchstart', ()=>{
  // su mobile puoi fare un doppio tap; intanto alla prima interazione nascondo il banner
  hideBanner();
},{passive:true});

/* ====== Bottoni ====== */
btnReset?.addEventListener('click', ()=>{
  top5=[1,2,3,4,5];
  scene.rotation.set(0,0,0);
  repaint();
});
btnShuffle?.addEventListener('click', ()=>{
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  top5 = pool.slice(0,5);
  repaint();
});

/* ====== Avvio ====== */
buildScene();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
