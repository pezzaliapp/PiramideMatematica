(()=>{'use strict';

// ---------- scena base ----------
const stage = document.getElementById('stage');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
camera.position.set(24, 26, 42);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci morbide (i numeri sono BasicMaterial -> non influenzati dalle luci)
scene.add(new THREE.AmbientLight(0xffffff, .9));
const key = new THREE.DirectionalLight(0xffffff, .4);
key.position.set(15, 25, 20); scene.add(key);

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

// ---------- parametri piramide ----------
const LAYERS = [5,4,3,2,1];         // 5×5 → 1×1
const STEP = 2.2;                    // passo griglia
const GEO  = new THREE.BoxGeometry(2.0, 2.0, 2.0);
const ROOT = new THREE.Group(); scene.add(ROOT);

// stato numeri:
// topRow[0..4] = numeri inseriti nella fila frontale (colonne 0..4). 0 = vuoto
const topRow = [0,0,0,0,0];
// fullValues[layer][i][j] = valore mostrato sul cubo (0 = vuoto)
const fullValues = LAYERS.map(N => Array.from({length:N},()=>Array(N).fill(0)));

// ---------- util ----------
function posFor(layer,i,j){
  // base (layer=0) è in alto; scende verso il basso
  const N = LAYERS[layer];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layer * STEP;
  return new THREE.Vector3(x,y,z);
}

// Canvas con numero (nero) e fondo bianco
function makeNumberCanvas(n, color='#000'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,256,256);
  g.fillStyle=color;
  g.textAlign='center'; g.textBaseline='middle';
  g.font='bold 180px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.fillText(String(n),128,138);
  return c;
}
function makeNumberTexture(n, color='#000'){
  const tx = new THREE.CanvasTexture(makeNumberCanvas(n, color));
  tx.anisotropy = 4; tx.needsUpdate = true;
  return tx;
}

// material bianco (Base), numeri neri su 6 facce
function matsFor(value, highlighted=false){
  const base = new THREE.MeshBasicMaterial({ color: highlighted ? 0xff5555 : 0xffffff });
  if(!value){
    // cubo vuoto ma SEMPRE bianco
    return [base,base,base,base,base,base];
  }
  const t = makeNumberTexture(value, highlighted?'#fff':'#000');
  // tutte le facce con la stessa texture
  const numbered = new THREE.MeshBasicMaterial({ map:t, color: highlighted?0xff5555:0xffffff });
  return [numbered, numbered, numbered, numbered, numbered, numbered];
}

// bordo nero
function addEdges(mesh){
  const egeo = new THREE.EdgesGeometry(mesh.geometry);
  const eln = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 1 });
  const lines = new THREE.LineSegments(egeo, eln);
  mesh.add(lines);
  return lines;
}

// ---------- costruzione piramide ----------
const cubes = []; // {mesh, layer,i,j}

function buildPyramid(){
  // pulizia
  while(ROOT.children.length) ROOT.remove(ROOT.children[0]);
  cubes.length = 0;

  // costruisci tutti i livelli
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const m = new THREE.Mesh(GEO, matsFor(0,false));
        m.position.copy(posFor(l,i,j));
        m.userData = { layer:l, i, j };
        addEdges(m);
        ROOT.add(m);
        cubes.push({ mesh:m, layer:l, i, j });
      }
    }
  }
}
buildPyramid();

// ---------- logica gioco ----------

// 1) replica sulla base: lo stesso valore della colonna frontale (j=0) si copia su tutta la colonna j=0..N-1
function repaintBaseFromTopRow(){
  // azzera tutto
  for(let l=0;l<LAYERS.length;l++){
    const N=LAYERS[l];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) fullValues[l][i][j]=0;
  }
  // base layer = 0
  const N0 = LAYERS[0]; // 5
  for(let i=0;i<N0;i++){
    const v = topRow[i]||0;
    for(let j=0;j<N0;j++){
      fullValues[0][i][j] = v;
    }
  }
}

// 2) differenze in cascata (assolute) dai valori del layer precedente, SOLO lungo j=0 (fronte) per costruire la piramide: ogni riga sotto dipende dalla riga sopra *sulla colonna frontale*, poi copiamo quel valore su tutta la riga del layer corrispondente per mantenere la “fascia” uniforme visivamente
function computeDifferences(){
  // se manca un numero nella topRow, non propaghiamo
  if(topRow.some(v=>!v)) return;

  // front-row del layer 0 (j=0)
  // layer 1 (4 elementi) = |a-b| delle coppie adiacenti della front-row di layer 0
  // poi layer 2,3,4 analogamente
  let row = topRow.slice(); // length=5

  for(let l=1; l<LAYERS.length; l++){
    const next = [];
    for(let k=0;k<row.length-1;k++){
      next.push( Math.abs(row[k] - row[k+1]) );
    }
    // scrivi questi valori nel layer l, su tutti i cubi della riga (i = 0..N-1) e TUTTE le colonne (j=0..N-1) per “fascia” uniforme
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      const v = next[i];
      for(let j=0;j<N;j++){
        fullValues[l][i][j] = v;
      }
    }
    row = next;
  }
}

// 3) evidenzia duplicati (in tutta la piramide, esclusi 0)
function computeDuplicatesSet(){
  const seen = new Map(); // value -> count
  for(let l=0;l<LAYERS.length;l++){
    const N=LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const v = fullValues[l][i][j];
        if(v>0){
          seen.set(v, (seen.get(v)||0)+1);
        }
      }
    }
  }
  const dups = new Set();
  for(const [v,cnt] of seen){
    if(cnt>1) dups.add(v);
  }
  return dups;
}

// 4) aggiorna i materiali in base a valori + duplicati
function repaint(){
  const duplicates = computeDuplicatesSet();

  // calcolo conteggio differenze UNICHE (nel triangolo: 4+3+2+1=10 celle -> qui sono le “fasce” l=1..4, colonna frontale i=0..N-1)
  const diffSet = new Set();
  for(let l=1;l<LAYERS.length;l++){
    const N=LAYERS[l];
    for(let i=0;i<N;i++){
      const v = fullValues[l][i][0]; // prendo la colonna frontale come “vera differenza”
      if(v>0) diffSet.add(v);
    }
  }
  document.getElementById('status').innerHTML =
    `Differenze uniche: <b>${diffSet.size}/10</b>`;

  // applica materiali
  for(const c of cubes){
    const v = fullValues[c.layer][c.i][c.j];
    const highlight = (v>0 && duplicates.has(v));
    c.mesh.material = matsFor(v, highlight);
  }
}

// 5) set da palette
let selectedNumber = 1;
function buildPalette(){
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  for(let n=1;n<=15;n++){
    const el = document.createElement('div');
    el.className = 'chip' + (n===selectedNumber?' active':'');
    el.textContent = n;
    el.addEventListener('click', ()=>{
      selectedNumber = n;
      [...pal.children].forEach(ch=>ch.classList.remove('active'));
      el.classList.add('active');
    });
    pal.appendChild(el);
  }
}
buildPalette();

// 6) picking: consento click SOLO su layer=0 e j=0 (fila frontale). Metto il numero scelto in topRow[i].
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickFrontSlot(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left)/r.width)*2 - 1;
  ndc.y = -((clientY - r.top)/r.height)*2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(ROOT.children, true);
  for(const h of hits){
    let o = h.object;
    while(o && o.parent && o.parent!==ROOT) o=o.parent;
    if(!o) continue;
    const ud = o.userData;
    if(ud && ud.layer===0 && ud.j===0){ // SOLO fila frontale
      return ud.i; // colonna 0..4
    }
  }
  return -1;
}

renderer.domElement.addEventListener('pointerdown', onPointerDown, {passive:false});
let isDragging=false,lastX=0,lastY=0;
function onPointerDown(e){
  e.preventDefault();
  lastX=e.clientX; lastY=e.clientY;
  isDragging=true;

  const i = pickFrontSlot(e.clientX, e.clientY);
  if(i>=0){
    topRow[i] = selectedNumber;      // assegna
    repaintBaseFromTopRow();         // replica fasce sulla base
    computeDifferences();            // calcola piramide
    repaint();                       // ridisegna + duplicati
  }
}
addEventListener('pointermove',(e)=>{
  if(!isDragging) return;
  const dx=(e.clientX-lastX)/140, dy=(e.clientY-lastY)/140;
  ROOT.rotation.y+=dx; ROOT.rotation.x+=dy;
  lastX=e.clientX; lastY=e.clientY;
});
addEventListener('pointerup',()=>{ isDragging=false; });

// Buttons
document.getElementById('btn-reset').addEventListener('click', ()=>{
  for(let k=0;k<5;k++) topRow[k]=0;
  repaintBaseFromTopRow();
  computeDifferences();
  repaint();
});
document.getElementById('btn-shuffle').addEventListener('click', ()=>{
  // mescola 5 numeri distinti 1..15
  const pool = Array.from({length:15},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const five = pool.slice(0,5);
  for(let i=0;i<5;i++) topRow[i]=five[i];
  repaintBaseFromTopRow();
  computeDifferences();
  repaint();
});

// ---------- primo render ----------
repaintBaseFromTopRow();
computeDifferences();
repaint();

(function loop(){
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
})();

})(); 
