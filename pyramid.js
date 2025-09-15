(()=>{'use strict';

/* ---------- Setup base ---------- */
const STAGE = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(STAGE.clientWidth, STAGE.clientHeight);
STAGE.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, .9));
const dir = new THREE.DirectionalLight(0xffffff, .65); dir.position.set(10,20,14); scene.add(dir);

function onResize(){
  const w = STAGE.clientWidth, h = STAGE.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ---------- Costanti ---------- */
const LAYERS = [5,4,3,2,1];
const STEP=2.2, STEP_Y=2.2, SIZE=2.02;
const GEO = new THREE.BoxGeometry(SIZE,SIZE,SIZE);
const EDGE_N = 0x111111, EDGE_SEL=0x0077ff, COL_WHITE=0xffffff;

/* ---------- Texture numeri (su tutte le facce) ---------- */
const tcache = new Map();
function canvasNum(n, col='#000', bg='#fff'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=col; g.font='bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(n),128,142); return c;
}
function numTex(n, err){ const k=n+'|'+(err?'e':'o');
  if(!tcache.has(k)){ const tx=new THREE.CanvasTexture(canvasNum(n, err?'#ff3030':'#000','#fff')); tx.anisotropy=4; tcache.set(k,tx);}
  return tcache.get(k);
}
const lambertWhite = new THREE.MeshLambertMaterial({color:COL_WHITE});
function matsFor(v, err){
  if(v==null) return [lambertWhite,lambertWhite,lambertWhite,lambertWhite,lambertWhite,lambertWhite];
  const m = new THREE.MeshBasicMaterial({map:numTex(v,err)});
  return [m,m,m,m,m,m];
}

/* ---------- Posizioni ---------- */
function posFor(L,i,j){
  const N = LAYERS[L];
  return new THREE.Vector3(
    (i-(N-1)/2)*STEP,
    -L*STEP_Y,
    (j-(N-1)/2)*STEP
  );
}

/* ---------- Costruzione mesh ---------- */
const cells=[]; // {mesh,edges,edgesMat,layer,i,j,value,error,_sel}
const values = LAYERS.map(N => Array.from({length:N},()=>Array(N).fill(null)));

function build(){
  // elimina tutto tranne le luci
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i]; if(!o.isLight) scene.remove(o);
  }
  cells.length=0;

  for(let L=0;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      const mesh = new THREE.Mesh(GEO, matsFor(null,false));
      mesh.position.copy(posFor(L,i,j)); mesh.userData={layer:L,i,j}; scene.add(mesh);
      const egeo = new THREE.EdgesGeometry(GEO);
      const emat = new THREE.LineBasicMaterial({color:EDGE_N});
      const edges = new THREE.LineSegments(egeo, emat); edges.position.copy(mesh.position); scene.add(edges);
      cells.push({mesh,edges,edgesMat:emat,layer:L,i,j,value:null,error:false,_sel:false});
    }
  }
}
build();

/* ---------- Modello & logica ---------- */
// top front = layer 0, j==0
function setTopFront(i, n){
  // Imposto solo nel modello (fila frontale)
  values[0][i][0] = n;
  // Replico visivamente il numero su tutta la riga del top (coerenza grafica)
  for(let j=1;j<LAYERS[0];j++) values[0][i][j]=n;
  recomputeAll();
}
function clearModel(){
  for(let L=0;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=null;
  }
}

/* differenze a cascata, con 0/duplicati marcati dopo */
function recomputeAll(){
  // pulisci layer sotto
  for(let L=1;L<LAYERS.length;L++){
    const N=LAYERS[L]; for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=null;
  }
  // costruisci dal top front
  const topLine = Array.from({length:LAYERS[0]},(_,i)=>values[0][i][0]);
  let prev = topLine;
  for(let L=1;L<LAYERS.length;L++){
    const N = LAYERS[L]; const next = Array(N).fill(null);
    for(let i=0;i<N;i++){
      const a=prev[i], b=prev[i+1];
      if(a!=null && b!=null){
        const d = Math.abs(a-b);
        next[i]=d;
        for(let j=0;j<N;j++) values[L][i][j]=d; // replica su riga del livello
      }
    }
    prev=next;
  }
  markErrors(); repaint(); updateStatus();
}

/* marcatura errori: 0 vietato; duplicati (su qualunque livello) */
function markErrors(){
  for(const c of cells) c.error=false;
  const count=new Map();
  for(const c of cells){
    const v = values[c.layer][c.i][c.j];
    if(v!=null){ const k=String(v); count.set(k,(count.get(k)||0)+1); }
  }
  for(const c of cells){
    const v = values[c.layer][c.i][c.j];
    if(v==null) continue;
    if(v===0) { c.error=true; continue; }
    if(count.get(String(v))>1) c.error=true;
  }
}

/* repaint mesh + bordo */
function repaint(){
  for(const c of cells){
    const v=values[c.layer][c.i][c.j];
    c.mesh.material = matsFor(v, c.error);
    c.edgesMat.color.setHex(c._sel ? EDGE_SEL : (c.error?0xff3030:EDGE_N));
  }
}

/* stato: quante differenze uniche sono definite (max 10) */
function updateStatus(){
  const diffs=[];
  for(let L=1;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++){
      const v=values[L][i][0];
      if(v!=null) diffs.push(v);
    }
  }
  const uniq = new Set(diffs).size;
  const el=document.getElementById('status'); if(el) el.innerHTML=`Differenze uniche: <b>${uniq}/10</b>`;
}

/* ---------- Palette ---------- */
const palette = document.getElementById('palette');
let selectedValue = null;
let selectedCell = null;

function buildPalette(){
  if(!palette) return;
  palette.innerHTML='';
  for(let n=1;n<=15;n++){
    const d=document.createElement('div'); d.className='chip'; d.textContent=String(n);
    d.addEventListener('click', ()=>{
      selectedValue=n;
      palette.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      d.classList.add('active');
      // se c'è già un cubo selezionato → assegna subito
      if(selectedCell){ setTopFront(selectedCell.i, selectedValue); unselectCell(); }
    });
    palette.appendChild(d);
  }
}
buildPalette();

function unselectCell(){
  if(selectedCell){ selectedCell._sel=false; selectedCell=null; repaint(); }
}

/* ---------- Picking / interazione ---------- */
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2();
function pickFront(clientX, clientY){
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((clientX-r.left)/r.width)*2-1; mouse.y=-((clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(mouse,camera);
  const hits=ray.intersectObjects(cells.map(c=>c.mesh),false);
  for(const h of hits){
    const ud=h.object.userData; if(!ud) continue;
    if(ud.layer===0 && ud.j===0){ // solo 5 frontali del top
      return cells.find(c=>c.layer===0 && c.i===ud.i && c.j===0) || null;
    }
  }
  return null;
}

renderer.domElement.addEventListener('click',(e)=>{
  const c=pickFront(e.clientX,e.clientY); if(!c) return;
  // selezione bordo
  unselectCell(); selectedCell=c; c._sel=true; repaint();
  if(selectedValue!=null){ setTopFront(c.i, selectedValue); unselectCell(); }
});

/* rotazione drag; non ruoto quando il puntatore è sui cubi (miglior touch) */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;},{passive:true});
addEventListener('pointerup',()=>dragging=false,{passive:true});
addEventListener('pointermove',e=>{
  if(!dragging) return;
  if(pickFront(e.clientX,e.clientY)) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y+=dx; scene.rotation.x+=dy; px=e.clientX; py=e.clientY;
},{passive:true});

/* ---------- Bottoni ---------- */
document.getElementById('btn-reset')?.addEventListener('click',()=>{
  clearModel(); selectedValue=null; palette?.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  unselectCell(); recomputeAll();
});

document.getElementById('btn-shuffle')?.addEventListener('click',()=>{
  // 5 numeri distinti 1..15
  const pool=Array.from({length:15},(_,k)=>k+1).sort(()=>Math.random()-0.5).slice(0,5);
  for(let i=0;i<5;i++) setTopFront(i,pool[i]);
  selectedValue=null; palette?.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  unselectCell();
});

/* ---------- Avvio ---------- */
function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); }
clearModel(); recomputeAll(); loop();

})();
