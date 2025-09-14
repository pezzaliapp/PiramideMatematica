// Piramide Matematica 3D
const stage=document.getElementById('stage');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x1e2430);

// Camera prospettica
const camera=new THREE.PerspectiveCamera(45,window.innerWidth/window.innerHeight,0.1,100);
camera.position.set(0,10,20);
camera.lookAt(0,0,0);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth,window.innerHeight);
stage.appendChild(renderer.domElement);

window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});

// Luci
scene.add(new THREE.AmbientLight(0xffffff,0.8));
const dir=new THREE.DirectionalLight(0xffffff,0.5);
dir.position.set(10,20,10);
scene.add(dir);

// Parametri
const SIZE=2.2; const GAP=0.05;
const COLORS=[0x2196f3,0x4caf50,0xf44336,0xff9800,0x9c27b0,0x00bcd4];
let cubes=[], numbers=[];

// Testo su facce
function makeTextTexture(num){
  const c=document.createElement('canvas'); c.width=128;c.height=128;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#1e2430'; ctx.fillRect(0,0,128,128);
  ctx.fillStyle='#fff'; ctx.font='bold 64px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(num,64,64);
  const tex=new THREE.CanvasTexture(c); return tex;
}

// Crea cubo numerato
function makeCube(num,color){
  const geo=new THREE.BoxGeometry(SIZE,SIZE,SIZE);
  const mats=[];
  for(let i=0;i<6;i++){
    mats.push(new THREE.MeshLambertMaterial({map:makeTextTexture(num),color}));
  }
  const mesh=new THREE.Mesh(geo,mats);
  mesh.userData.num=num;
  return mesh;
}

// Costruisci piramide
function buildPyramid(){
  cubes.forEach(c=>scene.remove(c)); cubes=[];
  numbers=[];
  const base=5;
  for(let row=0; row<base; row++){
    for(let col=0; col<base-row; col++){
      const num=Math.floor(Math.random()*15)+1;
      const cube=makeCube(num,COLORS[(row+col)%COLORS.length]);
      const x=(col-(base-row-1)/2)*(SIZE+GAP);
      const y=-row*(SIZE+GAP);
      const z=row*(SIZE+GAP); // profondità per effetto piramidale
      cube.position.set(x,y,z);
      scene.add(cube);
      cubes.push(cube); numbers.push(num);
    }
  }
  updateStatus();
}

// Controllo differenze uniche
function updateStatus(){
  let diffs=new Set();
  for(let i=0;i<numbers.length;i++){
    for(let j=i+1;j<numbers.length;j++){
      diffs.add(Math.abs(numbers[i]-numbers[j]));
    }
  }
  document.getElementById('status').textContent='Differenze uniche: '+diffs.size+'/10';
}

// Reset
function resetPyramid(){ buildPyramid(); }

// Scramble (mescola top row)
function scramble(){
  for(let i=0;i<5;i++){
    const idx=i;
    numbers[idx]=Math.floor(Math.random()*15)+1;
    cubes[idx].material.forEach(m=>m.map=makeTextTexture(numbers[idx]));
    cubes[idx].userData.num=numbers[idx];
  }
  updateStatus();
}

buildPyramid();

// Orbita base
let isDragging=false, prevX=0, prevY=0;
stage.addEventListener('mousedown',e=>{isDragging=true; prevX=e.clientX; prevY=e.clientY;});
window.addEventListener('mouseup',()=>isDragging=false);
window.addEventListener('mousemove',e=>{
  if(!isDragging)return;
  const dx=e.clientX-prevX, dy=e.clientY-prevY;
  scene.rotation.y+=dx*0.01; scene.rotation.x+=dy*0.01;
  prevX=e.clientX; prevY=e.clientY;
});

function animate(){ requestAnimationFrame(animate); renderer.render(scene,camera); }
animate();
