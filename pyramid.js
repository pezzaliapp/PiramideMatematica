(()=>{'use strict';

// ---- Setup base scene -------------------------------------------------------
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // sfondo bianco

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.domElement.style.display = 'block';
renderer.domElement.style.touchAction = 'none'; // iOS drag
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff, .9));
const dir = new THREE.DirectionalLight(0xffffff, .45);
dir.position.set(10,20,14);
scene.add(dir);

// Resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.render(scene,camera);
}
addEventListener('resize', onResize, {passive:true});
onResize();

// ---- Geometria piramide 5,4,3,2,1 ------------------------------------------
const LAYERS = [5,4,3,2,1];     // base (in alto) -> punta (in basso)
const STEP   = 2.20;            // distanza tra centri X/Z
const STEP_Y = 2.20;            // distanza verticale
const SIZE   = 2.18;            // lato del cubo (≈ STEP → piramide "unita")
const GEO    = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

// Colori tenui per layer (solo di "base" sotto i numeri)
const LAYER_COLORS = [0xffb0b0,0xffd28c,0xfff08c,0xc9ff8c,0x98ffa6];

// Utility posizione (centra ogni layer)
function positionFor(layerIdx, i, j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layerIdx * STEP_Y;
  return new THREE.Vector3(x,y,z);
}

// ---- Texture con numero su canvas (la stessa su tutte le 6 facce) ----------
const numberTexCache = new Map();
/** Ritorna una CanvasTexture con sfondo "baseColor" e numero bianco centrato */
function makeNumberTexture(num, baseColor){
  const key = `${num}|${baseColor}`;
  if(numberTexCache.has(key)) return numberTexCache.get(key);

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');

  // sfondo (leggermente scuro per contrasto sul bianco globale)
  g.fillStyle = '#1f2430';
  g.fillRect(0,0,256,256);

  // rettangolo del "tappo" colorato (per richiamare il layer)
  g.fillStyle = '#'+baseColor.toString(16).padStart(6,'0');
  g.fillRect(0,0,256,256);

  // numero
  g.fillStyle = '#ffffff';
  g.font = 'bold 150px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 128, 138);

  const tx = new THREE.CanvasTexture(c);
  tx.anisotropy = 4;
  tx.needsUpdate = true;
  numberTexCache.set(key, tx);
  return tx;
}

/** Materiali "vuoti" (nessun numero) */
const MAT_EMPTY = new Array(6).fill(
  new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness:0.1, roughness:0.65 })
);

/** Crea 6 materiali uguali con la stessa texture numerica */
function matsForNumber(num, baseColor){
  const map = makeNumberTexture(num, baseColor);
  return [0,1,2,3,4,5].map(()=> new THREE.MeshBasicMaterial({ map, transparent:false }));
}

// ---- Costruzione piramide vuota --------------------------------------------
const cubes = [];           // {mesh, layer, i, j, value, edge}
const group = new THREE.Group();
scene.add(group);

function buildPyramid(){
  // pulizia
  while(group.children.length) group.remove(group.children[0]);
  cubes.length = 0;

  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0; i<N; i++){
      for(let j=0; j<N; j++){
        const mesh = new THREE.Mesh(GEO, MAT_EMPTY.map(m=>m.clone()));
        mesh.position.copy(positionFor(l,i,j));

        // bordi (usati per errori duplicati)
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(GEO),
          new THREE.LineBasicMaterial({ color: 0xff3344, linewidth: 2 })
        );
        edges.visible = false;
        mesh.add(edges);

        group.add(mesh);
        cubes.push({ mesh, layer:l, i, j, value:null, edge:edges });
      }
    }
  }
}
buildPyramid();

// ---- Interazione: rotazione scena (mouse e touch) --------------------------
let dragging = false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true; px = e.clientX; py = e.clientY;
});
addEventListener('pointerup', ()=> dragging=false, {passive:true});
addEventListener('pointermove', e => {
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  group.rotation.y += dx;
  group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy));
  px=e.clientX; py=e.clientY;
});

// ---- Palette 1..15 ---------------------------------------------------------
const paletteEl = document.getElementById('palette');
let currentNumber = 1;
function buildPalette(){
  for(let n=1;n<=15;n++){
    const b = document.createElement('div');
    b.className = 'chip';
    b.textContent = n;
    if(n===currentNumber) b.classList.add('active');
    b.addEventListener('click', ()=>{
      currentNumber = n;
      for(const c of paletteEl.children) c.classList.remove('active');
      b.classList.add('active');
    });
    paletteEl.appendChild(b);
  }
}
buildPalette();

// ---- Picking: assegna numero al cubo cliccato ------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

function pickAt(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left)/r.width)*2 - 1;
  ndc.y = -((clientY - r.top)/r.height)*2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(group.children, true);
  if(!hits.length) return null;

  // risaliamo fino al cubo (il parent che è child diretto di group)
  let o = hits[0].object;
  while(o && o.parent && o.parent!==group) o = o.parent;
  return o;
}

function setCubeNumber(mesh, num){
  // trova record
  const rec = cubes.find(c => c.mesh === mesh);
  if(!rec) return;

  rec.value = num;
  const baseColor = LAYER_COLORS[rec.layer % LAYER_COLORS.length];
  const mats = matsForNumber(num, baseColor);
  rec.mesh.material = mats; // su TUTTE le 6 facce

  checkDuplicates();
  renderer.render(scene,camera);
}

renderer.domElement.addEventListener('click', e=>{
  const m = pickAt(e.clientX, e.clientY);
  if(!m) return;
  setCubeNumber(m, currentNumber);
});

// ---- Duplicati: bordo rosso su tutti i cubi col numero ripetuto ------------
function checkDuplicates(){
  const count = new Map(); // num -> count
  for(const c of cubes){
    if(c.value==null) continue;
    count.set(c.value, (count.get(c.value)||0)+1);
  }
  for(const c of cubes){
    const dup = c.value!=null && (count.get(c.value)||0) > 1;
    c.edge.visible = !!dup;
  }
  // placeholder per il contatore "differenze uniche": lo lascio 0/10 finché non
  // integriamo la logica matematica completa delle differenze.
  document.getElementById('status').innerHTML = 'Differenze uniche: <b>0/10</b>';
}

// ---- Reset -----------------------------------------------------------------
document.getElementById('btn-reset').addEventListener('click', ()=>{
  for(const c of cubes){
    c.value = null;
    c.mesh.material = MAT_EMPTY.map(m=>m.clone());
    c.edge.visible = false;
  }
  checkDuplicates();
  group.rotation.set(0,0,0);
  renderer.render(scene,camera);
});

// ---- Loop ------------------------------------------------------------------
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
