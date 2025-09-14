(()=>{'use strict';

// ---------- Scene base ----------
const STAGE = document.getElementById('stage');
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 30, 55);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(STAGE.clientWidth, STAGE.clientHeight);
renderer.domElement.style.touchAction = 'none'; // iOS drag senza scroll
STAGE.appendChild(renderer.domElement);

scene.background = new THREE.Color(0xffffff); // sfondo bianco richiesto

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(12,22,14);
scene.add(dir);

function onResize(){
  const w = STAGE.clientWidth, h = STAGE.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', onResize, {passive:true});
onResize();

// ---------- Geometria piramide ----------
const LAYERS = [5,4,3,2,1];       // 5×5 -> 1×1
const STEP   = 2.2;                // passo X/Z
const STEP_Y = 2.2;                // passo Y
const SIZE   = 2.18;               // edge cubo
const GEO    = new THREE.BoxGeometry(SIZE,SIZE,SIZE);

// piccola tavolozza per layer (solo estetica)
const LAYER_COL = [0xffadad,0xffe6a7,0xf9ffb5,0xbaffc9,0x98f5ff];

const cubes = []; // {mesh, layer, i, j}
const root  = new THREE.Group(); scene.add(root);

function centerCoord(n, idx){
  return (idx - (n-1)/2) * STEP;
}

function buildPyramid(){
  while(root.children.length) root.remove(root.children[0]);
  cubes.length = 0;

  for(let l=0; l<LAYERS.length; l++){
    const n = LAYERS[l];
    for(let i=0;i<n;i++){
      for(let j=0;j<n;j++){
        const m = new THREE.Mesh(
          GEO,
          new THREE.MeshStandardMaterial({color:LAYER_COL[l], metalness:0.05, roughness:0.65})
        );
        m.position.set(centerCoord(n,i), -l*STEP_Y, centerCoord(n,j));
        m.userData = {layer:l, i, j};
        root.add(m);
        cubes.push({mesh:m, layer:l, i, j});
      }
    }
  }
}
buildPyramid();

// ---------- Utility numeri su 6 facce ----------
function makeNumberCanvas(num, fg, bg){
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0,0,256,256);
  g.fillStyle = fg; g.font = 'bold 170px system-ui,-apple-system,Segoe UI,Roboto,Arial';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText(String(num), 128, 140);
  return new THREE.CanvasTexture(c);
}

function matsFor(num, baseColor, fg='#ffffff'){
  const bg = '#' + baseColor.toString(16).padStart(6,'0');
  const tx = makeNumberCanvas(num, fg, bg);
  const mat = new THREE.MeshBasicMaterial({map:tx});
  // 6 facce numerate
  return [mat,mat,mat,mat,mat,mat];
}

function colorMat(hex){
  return new THREE.MeshStandardMaterial({color:hex, metalness:0.05, roughness:0.65});
}

// ---------- Selezione cubi "di gioco": front-row per ogni layer ----------
function frontRow(l){
  const n = LAYERS[l];
  // j = 0 è la fila frontale (z minimo)
  return cubes
    .filter(c=>c.layer===l && c.j===0)
    .sort((a,b)=>a.i-b.i); // da sinistra a destra
}

// Indici: row[0] ha 5 cubi (riga alta), poi 4,3,2,1
const rows = [frontRow(0), frontRow(1), frontRow(2), frontRow(3), frontRow(4)];

// ---------- Stato gioco ----------
const paletteEl = document.querySelector('.bar'); // contiene i bottoni della palette
const statusEl  = document.getElementById('status');
const btnShuffle= document.getElementById('btn-shuffle');
const btnReset  = document.getElementById('btn-reset');

// valori della riga alta (lunghezza 5). Le altre righe sono derivate.
let topRow = [1,2,3,4,5];   // all’avvio richiesto: numeri già allineati
let selected = 1;           // numero attivo in palette

// Colore per i numeri (strato base del cubo)
const BASE_COLORS = [0xe57373,0xf06292,0xba68c8,0x9575cd,0x7986cb,
                     0x64b5f6,0x4fc3f7,0x4dd0e1,0x4db6ac,0x81c784,
                     0xaed581,0xdce775,0xfff176,0xffd54f,0xffb74d];
function baseColorFor(num){ return BASE_COLORS[(num-1)%BASE_COLORS.length]; }

// ---------- Rendering valori su cubi ----------
function setValueAtTop(index, val){
  topRow[index] = val;
  repaint();
}

function computeRows(){
  // dai 5 calcola 4, poi 3,2,1 (assoluti)
  const levels = [topRow.slice()];
  for(let r=0;r<4;r++){
    const prev = levels[r], next = [];
    for(let k=0;k<prev.length-1;k++){
      next.push(Math.abs(prev[k]-prev[k+1]));
    }
    levels.push(next);
  }
  return levels; // [5],[4],[3],[2],[1]
}

function clearRowMaterials(){
  // ripristina materiali colorati sui cubi "di gioco"
  rows.forEach((row,l)=>{
    row.forEach(c=>{
      c.mesh.material = colorMat(LAYER_COL[l]);
    });
  });
}

function repaint(){
  clearRowMaterials();

  const levels = computeRows(); // [5,4,3,2,1]

  // set numeri su 6 facce per ogni riga
  levels.forEach((vals, rIdx)=>{
    const row = rows[rIdx];
    for(let i=0;i<row.length;i++){
      const val = vals[i];
      const baseC = (rIdx===0) ? baseColorFor(val) : LAYER_COL[rIdx];
      row[i].mesh.material = matsFor(val, baseC, '#ffffff');
    }
  });

  // highlight errori (rosso): duplicati in riga alta; duplicati o zero nelle differenze
  highlightErrors(levels);

  // aggiorna status differenze uniche
  const diffs = levels.slice(1).flat(); // 4+3+2+1 = 10
  const uniq = new Set(diffs);
  const uniqueCount = [...uniq].filter(v=>v!==0).length;
  statusEl.querySelector('b').textContent = `${uniqueCount}/10`;
}

function highlightErrors(levels){
  // riga alta: duplicati
  const top = levels[0];
  const dupTop = new Set(top.filter((v,i)=> top.indexOf(v)!==i));
  if(dupTop.size){
    rows[0].forEach((c,i)=>{
      if(dupTop.has(top[i])){
        c.mesh.material = matsFor(top[i], 0xcc3333, '#ffffff'); // rosso
      }
    });
  }

  // differenze: 0 o duplicati
  const diffsLevels = levels.slice(1);
  const flat = diffsLevels.flat();
  const dupDiffs = new Set(flat.filter((v,i)=> v!==0 && flat.indexOf(v)!==i));
  diffsLevels.forEach((vals, rIdx)=>{
    rows[rIdx+1].forEach((c,i)=>{
      const v = vals[i];
      if(v===0 || dupDiffs.has(v)){
        c.mesh.material = matsFor(v, 0xcc3333, '#ffffff'); // rosso
      }
    });
  });
}

// ---------- Interazione ----------
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', (e)=>{ dragging=true; px=e.clientX; py=e.clientY; });
addEventListener('pointerup', ()=> dragging=false);
addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  root.rotation.y += dx; root.rotation.x += dy;
  px=e.clientX; py=e.clientY;
});

// palette (i bottoni 1..15 stanno nel tuo HTML, dentro .bar)
document.querySelectorAll('.bar button.num').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.bar button.num').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    selected = parseInt(btn.dataset.val,10);
  });
});

// click sui 5 cubi della riga alta per assegnare il numero selezionato
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
function pick(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  v2.x = ((clientX - r.left)/r.width)*2 - 1;
  v2.y = -((clientY - r.top)/r.height)*2 + 1;
  ray.setFromCamera(v2, camera);
  const hits = ray.intersectObjects(root.children, true);
  if(!hits.length) return null;
  // risali al mesh principale
  let o = hits[0].object;
  while(o && o.parent!==root) o = o.parent;
  return o || null;
}

renderer.domElement.addEventListener('click', (e)=>{
  const o = pick(e.clientX, e.clientY);
  if(!o || !o.userData) return;

  const {layer,i,j} = o.userData;
  // solo riga alta: layer 0 e j==0
  if(layer===0 && j===0){
    const idx = rows[0].findIndex(c=>c.mesh===o);
    if(idx>=0){
      setValueAtTop(idx, selected);
    }
  }
});

// Shuffle / Reset
btnShuffle?.addEventListener('click', ()=>{
  // mescola 5 numeri casuali 1..15 (possono ripetersi → poi li vedi rossi)
  for(let k=0;k<5;k++) topRow[k] = 1 + ((Math.random()*15)|0);
  repaint();
});
btnReset?.addEventListener('click', ()=>{
  topRow = [1,2,3,4,5];
  root.rotation.set(0,0,0);
  repaint();
});

// ---------- Banner superiore (palette numeri 1..15) ----------
(function ensurePalette(){
  // se nell'HTML non hai già i bottoni 1..15 con class="num", li genero qui
  if(document.querySelectorAll('.bar button.num').length) return;
  const bar = document.querySelector('.bar');
  const wrap = document.createElement('div');
  wrap.style.display='flex'; wrap.style.gap='6px'; wrap.style.flexWrap='wrap';
  for(let n=1;n<=15;n++){
    const b=document.createElement('button');
    b.className='num'; b.dataset.val=String(n);
    b.textContent=String(n);
    b.style.borderRadius='999px';
    b.style.background='#fff'; b.style.color='#0b5fff';
    b.style.fontWeight='700'; b.style.padding='6px 10px';
    wrap.appendChild(b);
  }
  bar.insertBefore(wrap, bar.children[1] || null);
  // attiva il primo
  setTimeout(()=>{
    const first = document.querySelector('.bar button.num');
    first?.classList.add('on');
  },0);
})();

// ---------- Avvio ----------
repaint();
(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();

})();
