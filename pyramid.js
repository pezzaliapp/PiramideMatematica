(()=>{'use strict';

// ------------------ Parametri scena
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(16, 22, 38);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// luci leggere (i numeri sono MeshBasicMaterial: non subiscono luci)
scene.add(new THREE.AmbientLight(0xffffff, .8));
const dir = new THREE.DirectionalLight(0xffffff, .4);
dir.position.set(8,10,12); scene.add(dir);

// resize
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true}); onResize();

// ------------------ Geometria piramide
const LAYERS = [5,4,3,2,1];          // 5×5 → 1×1
const STEP = 1.6;                     // passo X/Z
const GAP  = 0.06;                    // separazione
const SIZE = STEP - GAP;              // cubo bianco
const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

// materiale bianco
const WHITE = new THREE.MeshStandardMaterial({ color:0xffffff, metalness:0, roughness:.8 });

// crea contorno nero (Edges)
function addEdges(mesh){
  const eg = new THREE.EdgesGeometry(mesh.geometry);
  const ln = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:0x111111, linewidth:1 }));
  ln.renderOrder = 3;
  mesh.add(ln);
}

// texture numero (nero o rosso)
function numberTexture(num, color='#111', bg='#fff'){
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0,0,256,256);
  g.fillStyle = color;
  g.font = 'bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// crea 6 materiali identici (numero su tutte le facce)
function matsFor(num, red=false){
  const tex = numberTexture(num, red ? '#d10000' : '#111', '#fff');
  const mb = new THREE.MeshBasicMaterial({ map: tex }); // Basic -> invariante alla luce
  return [mb,mb,mb,mb,mb,mb];
}

// util per centrare i layer
function centerCoord(n){ return (i)=> (i - (n-1)/2) * STEP; }

// ------------------ Strutture dati
// cubes[layer][i][j] -> { mesh, front:boolean, colIndex:number }
const cubes = [];
// mapping dei 15 "slot frontali" (5+4+3+2+1) -> { layer, i, j(=0), behind: [ {layer,i,j}... ] }
const slots = [];

// costruzione piramide
function buildPyramid(){
  // pulizia
  while(scene.children.length>0){ const o=scene.children.pop(); if(o.isLight) continue; }
  scene.add(dir, ...[...scene.children].filter(o=>o.isLight)); // (ri-aggiunte luci da prima)
  cubes.length = 0; slots.length = 0;

  const root = new THREE.Group(); scene.add(root);

  let slotId = 0;
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    const cx = centerCoord(N), cz = centerCoord(N);
    const layer = [];
    for(let i=0;i<N;i++){
      const row = [];
      for(let j=0;j<N;j++){
        const mesh = new THREE.Mesh(GEO, WHITE.clone());
        mesh.position.set(cx(i), -l*STEP, cz(j));
        addEdges(mesh);
        root.add(mesh);
        row.push({ mesh, front: j===0, colIndex: -1, layer:l, i, j, value: null, red:false });
      }
      layer.push(row);
    }
    cubes.push(layer);

    // crea slot per la fila frontale (j===0) di questo layer
    for(let i=0;i<N;i++){
      const behind = [];
      for(let jj=0;jj<N;jj++){            // stessa colonna (stesso i), tutti i j (dietro)
        behind.push({ layer:l, i, j:jj });
        cubes[l][i][jj].colIndex = slotId;
      }
      slots.push({ layer:l, i, j:0, behind, value:null });
      slotId++;
    }
  }
}

// ------------------ Interazione / palette
const paletteDiv = document.getElementById('palette');
let currentNumber = 1;
function buildPalette(){
  paletteDiv.innerHTML = '';
  for(let n=1;n<=15;n++){
    const el = document.createElement('div');
    el.className = 'chip' + (n===currentNumber?' active':'');
    el.textContent = String(n);
    el.addEventListener('click', ()=>{
      currentNumber = n;
      [...paletteDiv.children].forEach(c=>c.classList.remove('active'));
      el.classList.add('active');
    });
    paletteDiv.appendChild(el);
  }
}
buildPalette();

// evidenzia duplicati (front slots che condividono lo stesso numero)
function highlightErrors(){
  // conta i numeri assegnati (solo slot con value)
  const counts = new Map();
  slots.forEach(s=>{
    if(s.value==null) return;
    counts.set(s.value, (counts.get(s.value)||0)+1);
  });

  // applica colorazione rossa ai duplicati
  slots.forEach(s=>{
    const dup = s.value!=null && counts.get(s.value)>1;
    s.behind.forEach(({layer,i,j})=>{
      const cell = cubes[layer][i][j];
      if(cell.value!=null){
        cell.mesh.material = matsFor(cell.value, dup);   // rosso se duplicato
        cell.red = dup;
      }
    });
  });
}

// assegna valore a uno slot (propaga a tutti i "dietro")
function setValueAtSlot(slotIndex, num){
  const s = slots[slotIndex];
  s.value = num;
  s.behind.forEach(({layer,i,j})=>{
    const cell = cubes[layer][i][j];
    cell.value = num;
    cell.mesh.material = matsFor(num, false);
  });
  highlightErrors();
  repaint();
}

// hit-test -> restituisce lo slot frontale più vicino alla colonna cliccata
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickFrontSlot(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left)/r.width)*2 - 1;
  ndc.y = -((clientY - r.top)/r.height)*2 + 1;
  ray.setFromCamera(ndc, camera);

  // Intersechiamo tutti i cubi ma risaliamo al “cell”
  const hits = ray.intersectObjects(scene.children, true);
  for(const h of hits){
    let o = h.object;
    // trova l’oggetto “mesh” che abbiamo creato (ha .userData.non usata qui)
    while(o && !o.geometry && o.parent) o = o.parent;
    if(!o) continue;

    // trova cell corrispondente
    for(let l=0;l<cubes.length;l++){
      const N = LAYERS[l];
      for(let i=0;i<N;i++){
        for(let j=0;j<N;j++){
          const cell = cubes[l][i][j];
          if(cell.mesh===o){
            // mappiamo sempre alla colonna dello stesso i nel medesimo layer
            return cell.colIndex; // è stato assegnato in buildPyramid()
          }
        }
      }
    }
  }
  return null;
}

// eventi: click -> assegna numero allo slot
renderer.domElement.addEventListener('pointerdown', (e)=>{
  // drag orbit? solo se fondo
  const slot = pickFrontSlot(e.clientX, e.clientY);
  if(slot!=null){
    setValueAtSlot(slot, currentNumber);
  }else{
    isDragging = true; px = e.clientX; py = e.clientY;
  }
});

// orbit semplice sullo sfondo (touch-friendly)
let isDragging=false, px=0, py=0;
addEventListener('pointermove', (e)=>{
  if(!isDragging) return;
  const dx = (e.clientX - px)/140, dy = (e.clientY - py)/140;
  scene.rotation.y += dx;
  scene.rotation.x += dy;
  px = e.clientX; py = e.clientY;
});
addEventListener('pointerup', ()=> isDragging=false);

// ------------------ UI tasti
document.getElementById('btn-reset').addEventListener('click', ()=>{
  slots.forEach(s=>s.value=null);
  for(let l=0;l<cubes.length;l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const cell = cubes[l][i][j];
        cell.value=null; cell.red=false;
        cell.mesh.material = WHITE.clone();
      }
    }
  }
  highlightErrors();
  repaint();
});

document.getElementById('btn-shuffle').addEventListener('click', ()=>{
  // solo i 5 slot del primo layer (base 5×5, frontali)
  const baseSlots = slots.slice(0,5);
  const nums = [1,2,3,4,5].sort(()=>Math.random()-.5);
  baseSlots.forEach((s,idx)=> setValueAtSlot(s.layer*0 + s.colIndex, nums[idx])); // colIndex già consecutivi
});

// ------------------ Pseudo “Differenze uniche” (placeholder 0/10 per ora)
const statusEl = document.getElementById('status');
function repaint(){ statusEl.innerHTML = 'Differenze uniche: <b>0/10</b>'; }

// ------------------ Avvio
buildPyramid();
repaint();

// render-loop
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
