(()=>{'use strict';
// Piramide vera: layer 5x5, 4x4, 3x3, 2x2, 1x1, con base in alto e punta in basso.

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f2430);

// Camera
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 28, 46);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff, .9));
const dir = new THREE.DirectionalLight(0xffffff, .45);
dir.position.set(10,20,14); scene.add(dir);

// Adattamento viewport
function onResize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); renderer.render(scene,camera);
}
addEventListener('resize', onResize, {passive:true}); onResize();

// Parametri geometria
const STEP = 2.2;         // passo tra i centri X/Z
const STEP_Y = 2.2;       // passo verticale tra layer
const SIZE = 2.18;        // dimensione cubo (≈ STEP per aspetto "unito")
const GEO  = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

const LAYERS = [5,4,3,2,1];  // 5x5 (base) in alto → 1x1 (punta) in basso

// Palette
function hsvToRgb(h, s, v){ let f=(n,k=(n+h*6)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0); return [f(5),f(3),f(1)].map(x=>Math.round(x*255)); }
const COLORS = Array.from({length:25},(_,i)=>{ const h=i/25,s=0.55,v=0.95; const [r,g,b]=hsvToRgb(h,s,v); return (r<<16)|(g<<8)|(b); });

// Numeri su faccia frontale (+Z)
function makeNumberTexture(num, fg='#fff', bg='#1b2538'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,256);
  g.fillStyle=fg; g.font='bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(num,128,140);
  const tx=new THREE.CanvasTexture(c); tx.anisotropy=4; tx.needsUpdate=true; return tx;
}

// Crea materiale: 5 lati colorati, il frontale con numero
function buildMaterials(colorHex, num){
  const side=new THREE.MeshLambertMaterial({color:colorHex});
  const mats=[side.clone(),side.clone(),side.clone(),side.clone(),side.clone(),side.clone()];
  mats[4]=new THREE.MeshBasicMaterial({map:makeNumberTexture(num)}); // +Z
  return mats;
}

// Centra ogni layer rispetto al suo N, e centra l'intera piramide
function positionFor(layerIdx,i,j){
  const N = LAYERS[layerIdx];
  const x = (i - (N-1)/2) * STEP;
  const z = (j - (N-1)/2) * STEP;
  const y = - layerIdx * STEP_Y; // base in alto (y=0), scendendo vai in basso
  return new THREE.Vector3(x,y,z);
}

const cubes=[];

function buildPyramid(){
  // pulizia
  for(const c of cubes) scene.remove(c.mesh);
  cubes.length=0;

  let k=1; // numero progressivo da stampare
  for(let l=0; l<LAYERS.length; l++){
    const N = LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const mats = buildMaterials(COLORS[(k-1)%COLORS.length], k);
        const m = new THREE.Mesh(GEO, mats);
        m.position.copy(positionFor(l,i,j));
        scene.add(m);
        cubes.push({mesh:m, layer:l, i, j, n:k});
        k++;
      }
    }
  }
}

// Interazione: trascina sullo sfondo per ruotare la piramide
let dragging=false, px=0, py=0;
renderer.domElement.addEventListener('pointerdown', (e)=>{ dragging=true; px=e.clientX; py=e.clientY; });
addEventListener('pointerup', ()=> dragging=false);
addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140, dy=(e.clientY-py)/140;
  scene.rotation.y += dx; scene.rotation.x += dy;
  px=e.clientX; py=e.clientY;
});

document.getElementById('reset').addEventListener('click', ()=>{
  scene.rotation.set(0,0,0);
});

buildPyramid();

(function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); })();
})();