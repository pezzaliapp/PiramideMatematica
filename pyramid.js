(()=>{'use strict';

/* ===================  SCENA  =================== */
const rootBG = '#ffffff';
const edgeColor = 0x111111;
const edgeSelected = 0x0077ff;

const stage = document.getElementById('stage');

const scene = new THREE.Scene();
scene.background = new THREE.Color(rootBG);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(0, 26, 46);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(10, 20, 14);
scene.add(dir);

function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

/* ===================  COSTANTI  =================== */
const LAYERS = [5,4,3,2,1];
const STEP=2.2, STEP_Y=2.2, SIZE=2.02;
const GEO = new THREE.BoxGeometry(SIZE,SIZE,SIZE);
const WHITE = 0xffffff;

/* ===================  TEXTURE NUMERI  =================== */
const texCache=new Map();
function makeNumberCanvas(n, fill='#000', bg='#fff'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fill; g.font='bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(n),128,142);
  return c;
}
function numberTexture(n, error=false){
  const key=`${n}|${error?'err':'ok'}`;
  if(texCache.has(key)) return texCache.get(key);
  const tx=new THREE.CanvasTexture(makeNumberCanvas(n, error?'#ff3030':'#000','#fff'));
  tx.anisotropy=4; tx.needsUpdate=true; texCache.set(key,tx); return tx;
}
function matsFor(n,error=false){
  if(n==null) return [new THREE.MeshLambertMaterial({color:WHITE}) ,new THREE.MeshLambertMaterial({color:WHITE}),new THREE.MeshLambertMaterial({color:WHITE}),new THREE.MeshLambertMaterial({color:WHITE}),new THREE.MeshLambertMaterial({color:WHITE}),new THREE.MeshLambertMaterial({color:WHITE})];
  const m=new THREE.MeshBasicMaterial({map:numberTexture(n,error)});
  return [m,m,m,m,m,m];
}
const whiteLambert = new THREE.MeshLambertMaterial({color:WHITE});

/* ===================  POSIZIONI  =================== */
function centerCoord(L,i,j){
  const N=LAYERS[L];
  return new THREE.Vector3(
    (i-(N-1)/2)*STEP,
    -L*STEP_Y,
    (j-(N-1)/2)*STEP
  );
}

/* ===================  COSTRUZIONE  =================== */
const cells=[]; // {mesh, edges, edgesMat, layer,i,j, value, error}
function buildPyramid(){
  // pulizia (mantieni luci)
  const keep=new Set([dir]);
  for(let i=scene.children.length-1;i>=0;i--){
    const o=scene.children[i];
    if(!o.isLight && !o.isCamera) scene.remove(o);
  }
  cells.length=0;

  for(let L=0; L<LAYERS.length; L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const mesh=new THREE.Mesh(GEO,[whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert,whiteLambert]);
        mesh.position.copy(centerCoord(L,i,j));
        mesh.userData={layer:L,i,j};
        scene.add(mesh);

        const eg=new THREE.EdgesGeometry(GEO);
        const edgesMat=new THREE.LineBasicMaterial({color:edgeColor});
        const edges=new THREE.LineSegments(eg, edgesMat);
        edges.position.copy(mesh.position);
        scene.add(edges);

        cells.push({mesh, edges, edgesMat, layer:L, i, j, value:null, error:false});
      }
    }
  }
}
buildPyramid();

/* ===================  MODELLO  =================== */
const values = LAYERS.map(N => Array.from({length:N},()=>Array(N).fill(null)));

function setTopFront(i, n){
  const L=0, jFront=0;
  values[L][i][jFront]=n;
  for(let j=1;j<LAYERS[0];j++) values[L][i][j]=n; // replica estetica
  recomputeDifferences();
  highlightDuplicates();
  repaintAll();
}

function recomputeDifferences(){
  // azzera sotto
  for(let L=1;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=null;
  }
  const top=[];
  for(let i=0;i<5;i++) top.push(values[0][i][0]);

  let prev=top;
  for(let L=1;L<LAYERS.length;L++){
    const N=LAYERS[L], next=Array(N).fill(null);
    for(let i=0;i<N;i++){
      const a=prev[i], b=prev[i+1];
      if(a!=null && b!=null){
        const d=Math.abs(a-b);
        next[i]=d;
        for(let j=0;j<N;j++) values[L][i][j]=d; // replica estetica
      }
    }
    prev=next;
  }
}

/* ===================  ERRORI / DUPLICATI  =================== */
function highlightDuplicates(){
  for(const c of cells) c.error=false;
  const count=new Map();
  for(const c of cells){
    const v=values[c.layer][c.i][c.j];
    if(v!=null) count.set(v,(count.get(v)||0)+1);
  }
  for(const c of cells){
    const v=values[c.layer][c.i][c.j];
    if(v!=null && (v===0 || (count.get(v)>1))) c.error=true;
  }
}

/* ===================  REPAINT  =================== */
function repaintAll(){
  for(const c of cells){
    const v=values[c.layer][c.i][c.j];
    c.mesh.material = matsFor(v, c.error);
    // bordo evidenziato solo se selezionato (gestito altrove)
    if(!c._selected) c.edgesMat.color.setHex(edgeColor);
  }
  const statusEl=document.getElementById('status');
  if(statusEl){
    let uniq=0;
    for(let L=1;L<LAYERS.length;L++){
      const N=LAYERS[L]; let full=true;
      for(let i=0;i<N;i++) if(values[L][i][0]==null){ full=false; break; }
      if(full) uniq++;
    }
    statusEl.innerHTML=`Differenze uniche: <b>${uniq}/10</b>`;
  }
}

/* ===================  PALETTE  =================== */
const paletteRow=document.getElementById('palette');
(function buildPalette(){
  if(!paletteRow) return;
  for(let n=1;n<=15;n++){
    const chip=document.createElement('div');
    chip.className='chip'; chip.textContent=n;
    chip.style.minWidth=chip.style.height='34px';
    chip.style.display='inline-flex';
    chip.style.alignItems=chip.style.justifyContent='center';
    chip.style.border='2px solid #fff';
    chip.style.background='#fff';
    chip.style.color='#000';
    chip.style.fontWeight='800';
    chip.style.borderRadius='999px';
    chip.style.cursor='pointer';
    chip.style.userSelect='none';
    paletteRow.appendChild(chip);
  }
})();

let selectedValue=null;
let selectedCell=null;

function clearChipHighlights(){
  paletteRow?.querySelectorAll('.chip').forEach(c=>c.style.boxShadow='none');
}
function clearCellSelection(){
  if(selectedCell){
    selectedCell._selected=false;
    selectedCell.edgesMat.color.setHex(edgeColor);
    selectedCell=null;
  }
}

paletteRow?.addEventListener('click',(ev)=>{
  const chip = ev.target.closest('.chip');
  if(!chip) return;
  const n=parseInt(chip.textContent,10);
  selectedValue=n;
  clearChipHighlights();
  chip.style.boxShadow='0 0 0 3px rgba(0,0,0,.2)';

  // Modalità 2: se ho già un cubo selezionato, assegno subito
  if(selectedCell){
    setTopFront(selectedCell.i, selectedValue);
    clearCellSelection();
  }
});

/* ===================  PICKING + INTERAZIONE  =================== */
const raycaster=new THREE.Raycaster();
const mouse=new THREE.Vector2();

function pickFrontSlot(clientX, clientY){
  const rect=renderer.domElement.getBoundingClientRect();
  mouse.x=((clientX-rect.left)/rect.width)*2-1;
  mouse.y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse, camera);
  const hits=raycaster.intersectObjects(cells.map(c=>c.mesh), false);
  for(const h of hits){
    const ud=h.object.userData||{};
    if(ud.layer===0 && ud.j===0){
      return cells.find(c=>c.layer===0 && c.i===ud.i && c.j===0) || null;
    }
  }
  return null;
}

// Clic sul canvas: se ho un numero scelto -> assegno. Altrimenti seleziono il cubo.
function onClickCanvas(ev){
  const pick=pickFrontSlot(ev.clientX, ev.clientY);
  if(!pick) return;

  // evidenzia selezione cubo
  clearCellSelection();
  selectedCell=pick;
  pick._selected=true;
  pick.edgesMat.color.setHex(edgeSelected);

  if(selectedValue!=null){
    setTopFront(pick.i, selectedValue);
    clearCellSelection(); // applicato, deseleziona
  }
}
renderer.domElement.addEventListener('click', onClickCanvas);

// Drag per ruotare: solo se non sono sopra un cubo
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown',(e)=>{dragging=true;px=e.clientX;py=e.clientY;},{passive:true});
addEventListener('pointerup',()=>dragging=false,{passive:true});
addEventListener('pointermove',(e)=>{
  if(!dragging) return;
  if(pickFrontSlot(e.clientX,e.clientY)) return; // sopra i cubi -> non ruotare
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y+=dx; scene.rotation.x+=dy;
  px=e.clientX; py=e.clientY;
},{passive:true});

/* ===================  BOTTONI  =================== */
document.getElementById('btn-reset')?.addEventListener('click', ()=>{
  for(let L=0;L<LAYERS.length;L++){
    const N=LAYERS[L];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) values[L][i][j]=null;
  }
  for(const c of cells){ c.error=false; c._selected=false; c.edgesMat.color.setHex(edgeColor); }
  selectedValue=null; clearChipHighlights(); clearCellSelection();
  recomputeDifferences(); highlightDuplicates(); repaintAll();
});

document.getElementById('btn-shuffle')?.addEventListener('click', ()=>{
  const nums=Array.from({length:15},(_,k)=>k+1).sort(()=>Math.random()-0.5).slice(0,5);
  for(let i=0;i<5;i++) setTopFront(i, nums[i]);
  clearCellSelection(); clearChipHighlights(); selectedValue=null;
});

/* ===================  AVVIO  =================== */
function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); }
recomputeDifferences(); highlightDuplicates(); repaintAll(); loop();

})();
