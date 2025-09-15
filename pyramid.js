(()=>{'use strict';

/* ========== Setup base ========== */
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

scene.add(new THREE.AmbientLight(0xffffff,.9));
const dir = new THREE.DirectionalLight(0xffffff,.65);
dir.position.set(10,20,14); scene.add(dir);

function onResize(){
  const w=STAGE.clientWidth, h=STAGE.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ========== Costanti/geo ========== */
const LAYERS=[5,4,3,2,1];
const STEP=2.2, STEP_Y=2.2, SIZE=2.02;
const GEO=new THREE.BoxGeometry(SIZE,SIZE,SIZE);
const EDGE_N=0x111111, EDGE_SEL=0x0077ff, COL_WHITE=0xffffff;

/* ========== Texture numeri (su tutte le facce) ========== */
const tcache=new Map();
function makeCanvasNumber(n, fg='#000', bg='#fff'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(n),128,142);
  return c;
}
function numberTexture(n, err){
  const key=n+'|'+(err?'e':'o');
  if(!tcache.has(key)){
    const tex=new THREE.CanvasTexture(makeCanvasNumber(n, err?'#ff3030':'#000','#fff'));
    tex.anisotropy=4; tcache.set(key,tex);
  }
  return tcache.get(key);
}
const matWhite = new THREE.MeshLambertMaterial({color:COL_WHITE});
function matsFor(v, err){
  if(v==null) return [matWhite,matWhite,matWhite,matWhite,matWhite,matWhite];
  const m=new THREE.MeshBasicMaterial({map:numberTexture(v,err)});
  return [m,m,m,m,m,m];
}

/* ========== Posizionamento ========== */
function posFor(L,i,j){
  const N=LAYERS[L];
  return new THREE.Vector3(
    (i-(N-1)/2)*STEP,
    -L*STEP_Y,
    (j-(N-1)/2)*STEP
  );
}

/* ========== Mesh & modello ========== */
const cells=[]; // {mesh,edges,edgesMat,layer,i,j,value,error,_sel}

/** griglia per il render (valore replicato su tutte le j) */
const values = LAYERS.map(N => Array.from({length:N},()=>Array(N).fill(null)));

/** modello logico: solo i rappresentanti frontali */
const topFront   = Array(5).fill(null);          // layer 0, 5 elementi
const belowFront = [null, Array(4).fill(null),   // [0] inutilizzato, [1]=4, [2]=3, [3]=2, [4]=1
                    Array(3).fill(null),
                    Array(2).fill(null),
                    Array(1).fill(null)];

function buildPyramid(){
  // rimuovi tutto tranne luci
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i]; if(!o.isLight) scene.remove(o);
  }
  cells.length=0;

  for(let L=0;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const mesh=new THREE.Mesh(GEO, matsFor(null,false));
        mesh.position.copy(posFor(L,i,j));
        mesh.userData={layer:L,i,j};
        scene.add(mesh);

        const edges=new THREE.LineSegments(
          new THREE.EdgesGeometry(GEO),
          new THREE.LineBasicMaterial({color:EDGE_N})
        );
        edges.position.copy(mesh.position); scene.add(edges);

        cells.push({mesh,edges,edgesMat:edges.material,layer:L,i,j,value:null,error:false,_sel:false});
      }
    }
  }
}
buildPyramid();

/* ========== Logica ========== */
function clearModel(){
  topFront.fill(null);
  for(let L=1;L<=4;L++) for(let i=0;i<belowFront[L].length;i++) belowFront[L][i]=null;
  for(let L=0;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=null;
  }
}

function propagateToRender(){
  // layer 0 replica topFront
  for(let i=0;i<5;i++) for(let j=0;j<5;j++) values[0][i][j]=topFront[i];
  // livelli sotto replica i rappresentanti
  for(let L=1;L<=4;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=belowFront[L][i];
  }
}

function recomputeDifferences(){
  // calcolo frontali a cascata (se entrambi definiti)
  let prev = topFront.slice(); // 5
  for(let L=1;L<=4;L++){
    const next = belowFront[L];
    for(let i=0;i<next.length;i++){
      const a=prev[i], b=prev[i+1];
      next[i] = (a!=null && b!=null) ? Math.abs(a-b) : null;
    }
    prev = next.slice();
  }
}

function markErrors(){
  // azzera errori
  for(const c of cells) c.error=false;

  // raccogli rappresentanti (layer 0 front, e per L>0 i frontali)
  const reps=[];
  for(let i=0;i<5;i++) reps.push({L:0,i,val:topFront[i]});
  for(let L=1;L<=4;L++) for(let i=0;i<belowFront[L].length;i++) reps.push({L,i,val:belowFront[L][i]});

  // conteggio duplicati tra rappresentanti
  const count=new Map();
  for(const r of reps){ if(r.val!=null){ const k=String(r.val); count.set(k,(count.get(k)||0)+1); } }

  // applica errori per riga se 0 o duplicato
  for(const r of reps){
    if(r.val==null) continue;
    const isErr = (r.val===0) || (count.get(String(r.val))>1);
    if(!isErr) continue;
    const N = LAYERS[r.L];
    for(let j=0;j<N;j++){
      // marca tutti i cubi della riga (stesso i) del layer r.L
      const c = cells.find(cc => cc.layer===r.L && cc.i===r.i && cc.j===j);
      if(c) c.error=true;
    }
  }
}

function repaint(){
  for(const c of cells){
    const v = values[c.layer][c.i][c.j];
    c.mesh.material = matsFor(v, c.error);
    c.edgesMat.color.setHex(c._sel ? EDGE_SEL : (c.error?0xff3030:EDGE_N));
  }
}

function updateStatus(){
  const diffs=[];
  for(let L=1;L<=4;L++) for(const v of belowFront[L]) if(v!=null) diffs.push(v);
  const uniq = new Set(diffs).size;
  const el=document.getElementById('status'); if(el) el.innerHTML=`Differenze uniche: <b>${uniq}/10</b>`;
}

function recalcPaintStatus(){
  recomputeDifferences();
  propagateToRender();
  markErrors();
  repaint();
  updateStatus();
}

/* assegna numero su uno dei 5 cubi frontali del top */
function setTopFront(i, n){
  if(!(n>=1 && n<=15)) return;         // blocca 0 e fuori range
  topFront[i]=n;
  recalcPaintStatus();
}

/* ========== Palette ========== */
const palette = document.getElementById('palette');
let selectedValue = null;
let selectedCell = null;

function buildPalette(){
  if(!palette) return;
  palette.innerHTML='';
  for(let n=1;n<=15;n++){
    const d=document.createElement('div');
    d.className='chip';
    d.textContent=String(n);
    d.addEventListener('click', ()=>{
      selectedValue=n;
      palette.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      d.classList.add('active');
      if(selectedCell){ setTopFront(selectedCell.i, selectedValue); unselectCell(); }
    });
    palette.appendChild(d);
  }
}
buildPalette();

function unselectCell(){
  if(selectedCell){ selectedCell._sel=false; selectedCell=null; repaint(); }
}

// ---- PICKING: solo i 5 cubi frontali del top ----
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pickFront(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(mouse, camera);

  const hits = ray.intersectObjects(cells.map(c => c.mesh), false);
  const FRONT_J = LAYERS[0] - 1;             // <-- colonna frontale (5x5 => j === 4)
  for (const h of hits) {
    const ud = h.object.userData;
    if (ud && ud.layer === 0 && ud.j === FRONT_J) {
      return cells.find(c => c.layer === 0 && c.i === ud.i && c.j === FRONT_J) || null;
    }
  }
  return null;
}

renderer.domElement.addEventListener('click',(e)=>{
  const c=pickFront(e.clientX,e.clientY); if(!c) return;
  unselectCell(); selectedCell=c; c._sel=true; repaint();
  if(selectedValue!=null){ setTopFront(c.i, selectedValue); unselectCell(); }
});

/* ========== Rotazione (drag sul vuoto) ========== */
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;},{passive:true});
addEventListener('pointerup',()=>dragging=false,{passive:true});
addEventListener('pointermove',e=>{
  if(!dragging) return;
  if(pickFront(e.clientX,e.clientY)) return; // non ruotare sopra ai cubi
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y+=dx; scene.rotation.x+=dy; px=e.clientX; py=e.clientY;
},{passive:true});

/* ========== Bottoni ========== */
document.getElementById('btn-reset')?.addEventListener('click',()=>{
  selectedValue=null; palette?.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  unselectCell(); clearModel(); recalcPaintStatus();
});

document.getElementById('btn-shuffle')?.addEventListener('click',()=>{
  const pool = Array.from({length:15},(_,k)=>k+1).sort(()=>Math.random()-0.5).slice(0,5);
  for(let i=0;i<5;i++) topFront[i]=pool[i];
  selectedValue=null; palette?.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  unselectCell(); recalcPaintStatus();
});

/* ========== Avvio ========== */
clearModel();
recalcPaintStatus();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
