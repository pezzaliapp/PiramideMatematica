(()=>{'use strict';

const rowsSpec = [5,4,3,2,1];                // piramide rovesciata
const solved = Array.from({length:15}, (_,i)=>i+1);
let board = [];
let moves = 0;
let t0 = null, timerIv = null;
let selected = null;
let dragSource = null;

const $ = sel => document.querySelector(sel);
const create = (tag,cls)=>{ const el=document.createElement(tag); if(cls) el.className=cls; return el; };
const shuffle = arr => { for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };
const fmtmmss = s => { const m=(''+((s/60)|0)).padStart(2,'0'); const ss=(''+(s%60|0)).padStart(2,'0'); return m+':'+ss; };

function startTimer(){ stopTimer(); t0 = Date.now(); timerIv = setInterval(()=>{ const sec=((Date.now()-t0)/1000)|0; $('#timer').textContent = fmtmmss(sec); }, 500); }
function stopTimer(){ if(timerIv){ clearInterval(timerIv); timerIv=null; } }

function initBoard(mescola=true){
  board = solved.slice();
  if(mescola) shuffle(board);
  moves = 0; $('#moves').textContent='Mosse: 0';
  $('#msg').classList.remove('show'); $('#msg').textContent='';
  startTimer();
  render();
}

function render(){
  const root = $('#pyramid');
  root.innerHTML = '';
  let offset = 0;
  for(let r=0;r<rowsSpec.length;r++){
    const n = rowsSpec[r];
    const row = create('div','row');
    row.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    root.appendChild(row);
    for(let c=0;c<n;c++){
      const idx = offset + c;
      const val = board[idx];
      const cell = create('button','cell');
      cell.type='button';
      cell.setAttribute('data-index', idx);
      cell.textContent = val;
      if(val === (idx+1)) cell.classList.add('correct');
      cell.addEventListener('click', ()=> handleSelect(cell));
      cell.draggable = true;
      cell.addEventListener('dragstart', ev=>{ dragSource=cell; ev.dataTransfer.setData('text/plain', cell.dataset.index); });
      cell.addEventListener('dragover', ev=>{ ev.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', ()=> cell.classList.remove('drag-over'));
      cell.addEventListener('drop', ev=>{
        ev.preventDefault(); cell.classList.remove('drag-over');
        const from = parseInt(ev.dataTransfer.getData('text/plain'),10);
        const to = parseInt(cell.dataset.index,10);
        if(!Number.isNaN(from) && from!==to) doSwap(from,to);
      });
      row.appendChild(cell);
    }
    offset += n;
  }
}

function handleSelect(cell){
  if(selected === cell){ cell.setAttribute('aria-selected','false'); selected=null; return; }
  if(!selected){ selected = cell; cell.setAttribute('aria-selected','true'); }
  else{
    const a = parseInt(selected.dataset.index,10);
    const b = parseInt(cell.dataset.index,10);
    selected.setAttribute('aria-selected','false'); selected=null;
    if(a!==b) doSwap(a,b);
  }
}

function doSwap(a,b){
  [board[a], board[b]] = [board[b], board[a]];
  moves++; $('#moves').textContent = 'Mosse: ' + moves;
  render();
  checkWin();
}

function checkWin(){
  for(let i=0;i<15;i++){ if(board[i] !== solved[i]) return; }
  stopTimer();
  const m = $('#msg'); m.textContent = '🎉 Completato!'; m.classList.add('show');
}

$('#btn-shuffle').addEventListener('click', ()=> initBoard(true));
$('#btn-reset').addEventListener('click',   ()=> initBoard(false));

initBoard(true);
})();