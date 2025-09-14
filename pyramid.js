(()=>{
'use strict';

/* ======= Setup base ======= */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
camera.position.set(0, 22, 52);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff,.9));
const dir = new THREE.DirectionalLight(0xffffff,.45); dir.position.set(10,20,12); scene.add(dir);

function onResize(){
  const w=stage.clientWidth, h=stage.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ======= Geometria & colori ======= */
const STEP  = 2.2;     // passo griglia (x/z)
const SIZE  = 2.0;     // lato cubo
const GAP_Y = 2.1;     // distanza verticale tra layer
const GEO   = new THREE.BoxGeometry(SIZE,SIZE,SIZE);

// palette soft coerente
function hsvToRgb(h,s,v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const pastel = Array.from({length:15},(_,i)=>{const h=(i/15)*.9,s=.5,v=.95;const [r,g,b]=hsvToRgb(h,s,v);return (r<<16)|(g<<8)|b});

// canvas→texture con numero grande (su tutte le facce)
function makeNumTexture(num, bg, fg='#fff'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(num),128,140);
  const tx=new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}
function matsNumber(num, colorHex, isError=false){
  const bg = isError ? '#D3002D' : `#${colorHex.toString(16).padStart(6,'0')}`;
  const m  = new THREE.MeshBasicMaterial({ map: makeNumTexture(num,bg) });
  return [m,m,m,m,m,m];
}
function matsSolid(colorHex){
  const m = new THREE.MeshLambertMaterial({color:colorHex});
  return [m,m,m,m,m,m];
}

/* ======= Dati logici del gioco ======= */
const LAYERS = [5,4,3,2,1];        // larghezze dei livelli (logica)
const GRID   = [5,4,3,2,1];        // anche in profondità per volumetria
const values = LAYERS.map(n=>Array(n).fill(null)); // valori del gioco (solo “fronte”)

const root = new THREE.Group(); scene.add(root);
const cells = LAYERS.map(n=>Array(n)); // celle del gioco (fronte)
const meshes3D = [];                   // tutti i cubi volumetrici per livello

// coordinate di una cella del “gioco” (fronte)
function posFor(r,c){
  const w = LAYERS[r];
  const x = (c-(w-1)/2)*STEP;
  const y = -r*GAP_Y;
  const z = 0; // fronte
  return new THREE.Vector3(x,y,z);
}
// coordinate volumetriche (riempimento)
function posFor3D(r,i,j){
  // r: livello (0..4)  i: x-index (0..W-1)  j: z-index (0..W-1)
  const w = GRID[r];
  const x = (i-(w-1)/2)*STEP;
  const y = -r*GAP_Y;
  const z = (j-(w-1)/2)*STEP;  // profondità
  return new THREE.Vector3(x,y,z);
}

/* ======= Costruzione piramide 5×5 → 1×1 ======= */
function buildPyramid(){
  // pulizia
  while(root.children.length) root.remove(root.children[0]);
  meshes3D.length=0;

  // CUBI DEL GIOCO (fronte): useremo questi per picking e numeri
  for(let r=0;r<LAYERS.length;r++){
    const row=[];
    for(let c=0;c<LAYERS[r];c++){
      const color = (r===0? pastel[c] : 0xdfe6ef);
      const mesh  = new THREE.Mesh(GEO, matsSolid(color));
      mesh.position.copy(posFor(r,c));
      mesh.userData = {type:'front', r, c};
      root.add(mesh);
      row[c] = {mesh, baseColor:color, value:null};
    }
    cells[r]=row;
  }

  // VOLUMETRIA: duplica i valori “di gioco” lungo la profondità per avere 5×5, 4×4, ...
  for(let r=0;r<GRID.length;r++){
    const w = GRID[r];
    const layerMeshes=[];
    for(let i=0;i<w;i++){
      const row=[];
      for(let j=0;j<w;j++){
        // inizialmente materiali “vuoti” (verranno rivestiti quando abbiamo i numeri)
        const color = (r===0? pastel[Math.min(i,4)]:0xeff4fa);
        const m = new THREE.Mesh(GEO, matsSolid(color));
        m.position.copy(posFor3D(r,i,j));
        m.userData = {type:'fill', r, i, j};
        root.add(m);
        row.push(m);
      }
      layerMeshes.push(row);
    }
    meshes3D.push(layerMeshes);
  }
}
buildPyramid();

/* ======= Calcoli “piramide matematica” ======= */
function computeRowBelow(src){
  const out=[];
  for(let i=0;i<src.length-1;i++){
    const a=src[i], b=src[i+1];
    if(a==null||b==null){ out.push(null); continue; }
    out.push(Math.abs(a-b));
  }
  return out;
}
function recompute(){
  // copia dalla base (fronte)
  values[0] = cells[0].map(c=>c.value);
  for(let r=1;r<LAYERS.length;r++){
    values[r] = computeRowBelow(values[r-1]);
  }
  repaintAll();
  updateStatus();
}
function updateStatus(){
  const diffs=[];
  for(let r=1;r<LAYERS.length;r++) for(let c=0;c<values[r].length;c++){
    const v=values[r][c]; if(v!=null) diffs.push(v);
  }
  const uniq = new Set(diffs);
  document.getElementById('status').innerHTML = `Differenze uniche: <b>${uniq.size}/10</b>`;
}
function repaintAll(){
  // frequenze di ogni numero che compare (base + differenze)
  const freq=new Map();
  for(let r=0;r<LAYERS.length;r++)
    for(let c=0;c<LAYERS[r].length;c++){
      const v=values[r][c]; if(v!=null) freq.set(v,(freq.get(v)||0)+1);
    }

  // 1) Pittura dei cubi “di gioco” (fronte)
  for(let r=0;r<LAYERS.length;r++){
    for(let c=0;c<LAYERS[r];c++){
      const cell=cells[r][c], v=values[r][c];
      if(v==null){ cell.mesh.material=matsSolid(cell.baseColor); continue; }
      const dup=(freq.get(v)||0)>1;
      cell.mesh.material=matsNumber(v, cell.baseColor, dup);
    }
  }

  // 2) Pittura volumetria: replica il valore della cella (r,c) su tutte le posizioni (i,j)
  //    mappando la colonna “x” i→c (stessa colonna) e “y” invariato; per i livelli sotto
  //    si usa la logica delle differenze già calcolate.
  for(let r=0;r<GRID.length;r++){
    const w=GRID[r];
    for(let i=0;i<w;i++){
      for(let j=0;j<w;j++){
        const m = meshes3D[r][i][j];
        // mappiamo i→colonna c, limitandoci alla larghezza della riga
        const c = Math.min(i, LAYERS[r]-1);
        const v = values[r][c];
        if(v==null){ 
          const color = (r===0? pastel[Math.min(i,4)]:0xeff4fa);
          m.material = matsSolid(color);
        }else{
          const dup=(freq.get(v)||0)>1;
          const color = (r===0? pastel[Math.min(i,4)]:0x9fb6cf);
          m.material = matsNumber(v, color, dup);
        }
      }
    }
  }
}

/* ======= Interazione: palette + inserimento ======= */
let selected = null;
// palette 1..15
const palette = document.getElementById('palette');
for(let n=1;n<=15;n++){
  const chip=document.createElement('div'); chip.className='chip'; chip.textContent=n;
  chip.addEventListener('click', ()=>{
    selected = n;
    [...palette.children].forEach(x=>x.classList.remove('active')); chip.classList.add('active');
  });
  palette.appendChild(chip);
}

// no duplicati nella riga base (5 celle)
function canPlaceValueAtBase(cIdx, val){
  if(val<1 || val>15 || !Number.isInteger(val)) return false;
  // niente ripetizioni nella base
  for(let i=0;i<5;i++){
    if(i!==cIdx && cells[0][i].value===val) return false;
  }
  return true;
}

// picking
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pickFrontCell(clientX,clientY){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((clientX-r.left)/r.width)*2-1; ndc.y= -((clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(root.children,true);
  if(!hits.length) return null;
  let o=hits[0].object;
  while(o && !o.userData?.type) o=o.parent;
  if(!o || o.userData.type!=='front') return null;
  return cells[o.userData.r][o.userData.c];
}

let dragging=false, px=0, py=0, rotX=0, rotY=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  dragging=true; px=e.clientX; py=e.clientY; rotX=root.rotation.x; rotY=root.rotation.y;
});
addEventListener('pointerup', e=>{
  if(!dragging) return; const moved=(Math.hypot(e.clientX-px,e.clientY-py)>4); dragging=false;
  if(moved) return;
  const cell=pickFrontCell(e.clientX,e.clientY); if(!cell) return;
  if(cell.mesh.userData.r!==0) return;                 // si assegna solo sulla riga “base” del gioco (fronte 5 celle)
  if(selected==null) return;
  const cIdx=cell.mesh.userData.c;
  if(!canPlaceValueAtBase(cIdx, selected)) return;     // vieta duplicati 1..15 sulla base
  cell.value=selected; recompute();
});
addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/160, dy=(e.clientY-py)/160;
  root.rotation.y=rotY+dx; root.rotation.x=rotX+dy;
});

// “doppio clic per iniziare”: posizionamento raccontato
let started=false;
stage.addEventListener('dblclick', ()=>{
  if(started) return; started=true;
  root.rotation.set(-0.25,0.25,0);
});

/* ======= Pulsanti ======= */
document.getElementById('btn-reset').addEventListener('click', ()=>{
  for(let i=0;i<5;i++) cells[0][i].value=null;
  selected=null; [...palette.children].forEach(x=>x.classList.remove('active'));
  recompute();
});
document.getElementById('btn-scramble').addEventListener('click', ()=>{
  const pool=[...Array(15)].map((_,i)=>i+1);
  for(let i=0;i<5;i++){
    const k=(Math.random()*pool.length)|0;
    cells[0][i].value=pool.splice(k,1)[0];
  }
  recompute();
});

/* ======= Primo render ======= */
recompute();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
