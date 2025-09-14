(()=>{'use strict';

/* =======================
   Setup scena/camera/render
   ======================= */
const stage = document.getElementById('stage');
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// Luci (gli sticker usano materiali "Basic" quindi non influenzati; la plastica sì)
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 0.45);
dir.position.set(10,20,14);
scene.add(dir);

/* =======================
   Adattamento viewport
   ======================= */
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  renderOnce();
}
window.addEventListener('resize', onResize, {passive:true});
onResize();

/* =======================
   Parametri piramide
   ======================= */
// Layer: base in alto (5x5) → … → punta (1x1) in basso
const LAYERS = [5,4,3,2,1];

// Spaziatura/scala: impostati per avere “blocchi uniti” a piramide
const STEP   = 2.2;   // distanza centri X/Z
const STEP_Y = 2.2;   // distanza verticale tra layer
const SIZE   = 2.18;  // lato cubo (≈ STEP per aspetto pieno)

const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

/* =======================
   Utility colori & texture numeri
   ======================= */
function hsvToRgb(h, s, v){
  let f = (n, k=(n+h*6)%6)=> v - v*s*Math.max(Math.min(k,4-k,1),0);
  const r = Math.round(f(5)*255);
  const g = Math.round(f(3)*255);
  const b = Math.round(f(1)*255);
  return (r<<16) | (g<<8) | b;
}

// palette 15 colori (ciclica se servisse di più)
const BASE_COLORS = Array.from({length:15},(_,i)=>hsvToRgb(i/15, 0.55, 0.95));

/** CanvasTexture con il numero “num” (bianco) su sfondo “bgHex”. */
function makeNumberTexture(num, bgHex){
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');

  // sfondo
  g.fillStyle = `#${bgHex.toString(16).padStart(6,'0')}`;
  g.fillRect(0,0,256,256);

  // numero
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // dimensione dinamica (2 o 3 cifre)
  const text = String(num);
  const fontSize = (text.length>=2) ? 150 : 170;
  g.font = `bold ${fontSize}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
  g.fillText(text, 128, 140);

  const tx = new THREE.CanvasTexture(c);
  tx.anisotropy = 4;
  tx.needsUpdate = true;
  return tx;
}

/** Crea i 6 materiali per un cubo:
 *  - plastica scura come “base” (MeshStandard)
 *  - su ogni faccia applico una MeshBasic col numero (non influenzata dalle luci)
 */
function matsFor(num, baseHex){
  // plastica “bordo” (non si vede molto perché coperta dalle facce basic)
  const plastic = new THREE.MeshStandardMaterial({ color:0x20232c, metalness:0.1, roughness:0.6 });

  // 6 facce con numeri (Basic = non soggetta a shading → niente zone scure in base all’illuminazione)
  const face = (axis)=> new THREE.MeshBasicMaterial({ map: makeNumberTexture(num, baseHex) });

  // NB: l’ordine materiali di BoxGeometry è: +X, -X, +Y, -Y, +Z, -Z
  return [
    face('+x'), face('-x'),
    face('+y'), face('-y'),
    face('+z'), face('-z'),
  ].map(m => m);
}

/* =======================
   Posizionamento blocchi
   ======================= */
function positionFor(layerIdx,i,j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layerIdx * STEP_Y;  // base in alto (y=0), scende verso la punta
  return new THREE.Vector3(x,y,z);
}

/* =======================
   Costruzione piramide
   ======================= */
const cubes = []; // {mesh, layer, i, j, n, colorHex}

function buildScene(){
  // pulizia
  for(const c of cubes) scene.remove(c.mesh);
  cubes.length = 0;

  let k = 1; // numeri 1..15 ripetuti per riempire tutta la piramide
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const num = ((k-1) % 15) + 1;
        const colorHex = BASE_COLORS[(num-1) % BASE_COLORS.length];

        const materials = matsFor(num, colorHex);
        // trucco: Mesh con 6 materiali Basic “sopra”, ma teniamo anche la plastica scura
        // → Creo un gruppo con: 1) box plastica (Standard) 2) box facce numerate (Basic) leggermente più piccolo
        const group = new THREE.Group();

        // plastica
        const plasticMesh = new THREE.Mesh(GEO, new THREE.MeshStandardMaterial({ color:0x20232c, metalness:0.1, roughness:0.6 }));
        group.add(plasticMesh);

        // “sticker” numerati (leggermente scalati per non z-fightare)
        const stickerGeo = GEO.clone();
        const s = 0.995; // micro-scale in
        stickerGeo.scale(s,s,s);
        const stickerMesh = new THREE.Mesh(stickerGeo, materials);
        group.add(stickerMesh);

        group.position.copy(positionFor(l,i,j));
        scene.add(group);

        cubes.push({mesh:group, layer:l, i, j, n:num, colorHex});
        k++;
      }
    }
  }
}

/* =======================
   Interazione: rotazione scena
   (mouse & touch – iPhone/Android)
   ======================= */
let dragging=false, px=0, py=0;

function startDrag(x,y){
  dragging = true; px = x; py = y;
}
function moveDrag(x,y){
  if(!dragging) return;
  const dx=(x-px)/140, dy=(y-py)/140;
  scene.rotation.y += dx;
  scene.rotation.x += dy;
  px = x; py = y;
}
function endDrag(){ dragging=false; }

// mouse
renderer.domElement.addEventListener('mousedown', e=> startDrag(e.clientX,e.clientY));
window.addEventListener('mouseup', endDrag);
window.addEventListener('mousemove', e=> moveDrag(e.clientX,e.clientY));

// touch
renderer.domElement.addEventListener('touchstart', e=>{
  if(e.touches.length===1){
    const t = e.touches[0];
    startDrag(t.clientX,t.clientY);
  }
},{passive:true});
renderer.domElement.addEventListener('touchmove', e=>{
  if(e.touches.length===1){
    const t = e.touches[0];
    moveDrag(t.clientX,t.clientY);
  }
},{passive:true});
renderer.domElement.addEventListener('touchend', endDrag);

/* =======================
   UI base (Reset / Mescola)
   ======================= */
const $ = (sel)=>document.querySelector(sel);
function renderOnce(){ renderer.render(scene,camera); }

function resetView(){
  scene.rotation.set(0,0,0);
  setStatus(0,10);
  renderOnce();
}

function setStatus(unique, total){
  const el = $('#status');
  if(!el) return;
  el.innerHTML = `Differenze uniche: <b>${unique}/${total}</b>`;
}

// demo shuffle: riassegna numeri random a TUTTI i blocchi mantenendo colore per numero (1..15)
function shuffleAll(){
  // genera permutazione di 1..15
  const base = Array.from({length:15}, (_,i)=>i+1);
  for(let i=base.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  // applica a tutti i cubi: prendi un numero dalla permutazione in ciclo
  let p = 0;
  for(const c of cubes){
    const num = base[p++ % 15];
    setCubeNumber(c, num);
  }
  // (qui potresti ricalcolare punteggi/regole, se implementate)
  renderOnce();
}

function setCubeNumber(cube, num){
  cube.n = num;
  const colorHex = BASE_COLORS[(num-1) % BASE_COLORS.length];
  cube.colorHex = colorHex;

  // il gruppo ha 2 figli: [0] plastica, [1] sticker numerati
  const stickerMesh = cube.mesh.children[1];
  const mats = matsFor(num, colorHex);
  stickerMesh.material = mats;
}

$('#btn-reset')?.addEventListener('click', resetView);
$('#btn-shuffle')?.addEventListener('click', shuffleAll);

/* =======================
   Avvio
   ======================= */
buildScene();
resetView();

// loop
(function animate(){
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
})();

})();
