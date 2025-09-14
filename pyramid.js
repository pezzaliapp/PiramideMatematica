(()=>{
'use strict';
const stage=document.getElementById('stage');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xffffff);

// Camera
const camera=new THREE.PerspectiveCamera(42,1,0.1,500);
camera.position.set(0,28,46);
camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(stage.clientWidth,stage.clientHeight);
stage.appendChild(renderer.domElement);

// Luci
scene.add(new THREE.AmbientLight(0xffffff,.9));
const dir=new THREE.DirectionalLight(0xffffff,.45);
dir.position.set(10,20,14);scene.add(dir);

// Resize
function onResize(){
  const w=stage.clientWidth,h=stage.clientHeight;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h);renderer.render(scene,camera);
}
addEventListener('resize',onResize,{passive:true});onResize();

// Geometria
const STEP=2.2, STEP_Y=2.2, SIZE=2.18;
const GEO=new THREE.BoxGeometry(SIZE,SIZE,SIZE);
const LAYERS=[5,4,3,2,1];

function makeNumberTexture(num,fg='#fff',bg='#1b2538'){
  const c=document.createElement('canvas');c.width=c.height=256;
  const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,256,256);
  g.fillStyle=fg;g.font='bold 160px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  g.textAlign='center';g.textBaseline='middle';g.fillText(num,128,140);
  const tx=new THREE.CanvasTexture(c);tx.anisotropy=4;tx.needsUpdate=true;return tx;
}
function buildMaterials(num,colorHex){
  return Array(6).fill(0).map(()=>new THREE.MeshBasicMaterial({
    map:makeNumberTexture(num,'#fff',colorHex)
  }));
}
function positionFor(layerIdx,i,j){
  const N=LAYERS[layerIdx];
  const x=(i-(N-1)/2)*STEP;
  const z=(j-(N-1)/2)*STEP;
  const y=-layerIdx*STEP_Y;
  return new THREE.Vector3(x,y,z);
}

const cubes=[];
function buildPyramid(){
  for(const c of cubes) scene.remove(c.mesh);
  cubes.length=0;
  let k=1;
  for(let l=0;l<LAYERS.length;l++){
    const N=LAYERS[l];
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        const color=`hsl(${(k*25)%360},70%,40%)`;
        const mats=buildMaterials((k-1)%15+1,color);
        const m=new THREE.Mesh(GEO,mats);
        m.position.copy(positionFor(l,i,j));
        m.userData={value:(k-1)%15+1};
        scene.add(m);cubes.push(m);
        k++;
      }
    }
  }
}
buildPyramid();

// Interazione rotazione
let dragging=false,px=0,py=0;
renderer.domElement.style.touchAction='none';
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;});
addEventListener('pointerup',()=>dragging=false);
addEventListener('pointermove',e=>{
  if(!dragging) return;
  const dx=(e.clientX-px)/140,dy=(e.clientY-py)/140;
  scene.rotation.y+=dx;scene.rotation.x+=dy;px=e.clientX;py=e.clientY;
});

document.getElementById('btn-reset').addEventListener('click',()=>{
  scene.rotation.set(0,0,0);
});

(function loop(){renderer.render(scene,camera);requestAnimationFrame(loop);})();
})();