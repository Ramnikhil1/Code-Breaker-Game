/* =========================================================
   Code Breaker – The Array Heist
   Teaches: insertion, deletion, subarray search + bounds
   ========================================================= */

(() => {
  // ---------- Config ----------
  const LEN = 10;               // number of slots
  const DEFAULT_TIMER = 60;     // seconds
  const SCAN_DELAY = 420;       // ms between scan windows
  const FLIP_MS = 300;          // animation duration

  // ---------- State ----------
  const slots = new Array(LEN).fill(null); // stores chip IDs or null per slot
  const items = new Map();                 // id -> { id, value }
  let nextId = 1;

  let level = 2;
  let secretPattern = [3, 7, 1];
  let levelNeedsReverse = false;

  let scanning = false;
  let timeMode = false;
  let timeLeft = DEFAULT_TIMER;
  let timerInt = null;
  let startedAt = null;
  let firstMoveStartedClock = false;
  let gameWon = false;

  // ---------- DOM ----------
  const grid = document.getElementById('arrayGrid');
  const msg = document.getElementById('msg');
  const secretEl = document.getElementById('secretPattern');
  const levelSelect = document.getElementById('levelSelect');
  const startBtn = document.getElementById('startBtn');
  const timeToggle = document.getElementById('timeToggle');
  const timerDisp = document.getElementById('timer');
  const confettiHost = document.getElementById('confettiHost');

  const insertIndexEl = document.getElementById('insertIndex');
  const insertValueEl = document.getElementById('insertValue');
  const deleteIndexEl = document.getElementById('deleteIndex');
  const patternInputEl = document.getElementById('patternInput');

  const insertBtn = document.getElementById('insertBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const searchBtn = document.getElementById('searchBtn');
  const resetBtn = document.getElementById('resetBtn');

  // ---------- Helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const randDigit = () => Math.floor(Math.random() * 10);
  const say = (text) => { msg.textContent = text; };

  function renderSlots(){
    grid.innerHTML = ""; // clear all
    for(let i=0;i<LEN;i++){
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = i;
      grid.appendChild(slot);
    }
    // Add chips for existing items
    for(let pos=0;pos<LEN;pos++){
      const chipId = slots[pos];
      if(chipId !== null){
        const chip = createOrGetChip(chipId);
        chip.dataset.index = pos;
        chip.style.gridColumn = (pos+1).toString(); // 1-based
        grid.appendChild(chip);
      }
    }
  }

  function createOrGetChip(id){
    let el = document.querySelector(`.chip[data-id="${id}"]`);
    if(el) return el;
    const item = items.get(id);
    el = document.createElement('div');
    el.className = 'chip';
    el.textContent = item.value;
    el.dataset.id = id;
    el.dataset.index = -1; // will be set later
    return el;
  }

  function captureRects(){
    const map = new Map();
    document.querySelectorAll('.chip').forEach(ch => {
      map.set(ch.dataset.id, ch.getBoundingClientRect());
    });
    return map;
  }

  function animateFLIP(prevRects){
    const chips = Array.from(document.querySelectorAll('.chip'));
    chips.forEach(ch => {
      const id = ch.dataset.id;
      const prev = prevRects.get(id);
      const now = ch.getBoundingClientRect();
      if(prev){
        const dx = prev.left - now.left;
        const dy = prev.top - now.top;
        if(Math.abs(dx) > 1 || Math.abs(dy) > 1){
          ch.style.transition = 'none';
          ch.style.transform = `translate(${dx}px, ${dy}px)`;
          // force reflow
          ch.getBoundingClientRect();
          ch.style.transition = `transform ${FLIP_MS}ms ease`;
          ch.style.transform = 'translate(0,0)';
          setTimeout(()=>{ ch.style.transition = ''; }, FLIP_MS+20);
        } else {
          // no move
        }
      } else {
        // New chip
        ch.classList.add('enter');
        setTimeout(()=> ch.classList.remove('enter'), 350);
      }
    });
  }

  function flashSlots(indices, cls, ms = 350){
    indices.forEach(i => {
      const slot = grid.querySelector(`.slot:nth-child(${i+1})`);
      if(slot){
        slot.classList.add(cls);
        setTimeout(()=> slot.classList.remove(cls), ms);
      }
    });
  }

  function playBeep(){
    tone(440, 0.12, 'sine', 0.02);
  }
  function playBuzz(){
    tone(120, 0.28, 'square', 0.03);
  }
  function playFanfare(){
    const seq = [
      [523, 0.14], [659, 0.14], [784, 0.18],
      [880, 0.18], [988, 0.16], [1175, 0.22]
    ];
    let t = 0;
    seq.forEach(([f, d]) => {
      setTimeout(()=> tone(f, d, 'triangle', 0.01), t*1000);
      t += d * 0.9;
    });
  }
  let audioCtx;
  function tone(freq, duration, type='sine', gain=0.02){
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      setTimeout(()=>{ o.stop(); }, duration*1000);
    }catch(e){ /* ignore if blocked */ }
  }

  function makeConfetti(){
    for(let i=0;i<24;i++){
      const span = document.createElement('span');
      span.className = 'confetti';
      span.textContent = Math.random() < 0.66 ? '🎉' : (Math.random()<0.5?'✨':'💥');
      span.style.left = (8 + Math.random()*84) + '%';
      span.style.top = '-10px';
      confettiHost.appendChild(span);
      setTimeout(()=> span.remove(), 1700);
    }
  }

  function updateHUD(){
    // level / secret pattern display
    const show = levelNeedsReverse ? [...secretPattern].slice().reverse() : secretPattern;
    const label = level === 1 ? '(2-digit)' : level === 2 ? '(3-digit)' : '(Reverse)';
    secretEl.textContent = `[ ${show.join(', ')} ] ${label}`;
    // timer
    timerDisp.textContent = `${timeLeft}s`;
  }

  function regenSecret(){
    if(level === 1){ secretPattern = [randDigit(), randDigit()]; levelNeedsReverse = false; }
    else if(level === 2){ secretPattern = [randDigit(), randDigit(), randDigit()]; levelNeedsReverse = false; }
    else {
      secretPattern = [randDigit(), randDigit(), randDigit()];
      levelNeedsReverse = true;
    }
  }

  function arrayValues(){
    return slots.map(id => id===null? null : items.get(id).value);
  }

  function startTimer(manual=false){
    if(!timeMode) return;
    if(timerInt) clearInterval(timerInt);
    if(!manual && firstMoveStartedClock) return;
    firstMoveStartedClock = true;
    startedAt = Date.now();
    timerInt = setInterval(()=>{
      timeLeft = Math.max(0, DEFAULT_TIMER - Math.floor((Date.now() - startedAt)/1000));
      timerDisp.textContent = `${timeLeft}s`;
      if(timeLeft <= 0){
        clearInterval(timerInt);
        if(!gameWon){
          say('⏰ Time’s up! The vault remains sealed… Try again.');
          playBuzz();
          scanning = false;
          disableControls(false);
        }
      }
    }, 250);
  }

  function stopTimer(){
    if(timerInt){ clearInterval(timerInt); timerInt = null; }
  }

  function resetGame(keepLevel=false){
    // wipe chips
    const prev = captureRects();
    // remove any chip elements
    slots.fill(null);
    items.clear();
    nextId = 1;
    gameWon = false;
    firstMoveStartedClock = false;
    timeLeft = DEFAULT_TIMER;
    stopTimer();
    renderSlots();
    animateFLIP(prev);
    if(!keepLevel) level = parseInt(levelSelect.value, 10);
    regenSecret();
    updateHUD();
    say('Board reset. New mission loaded. Insert digits and find the secret pattern!');
  }

  function disableControls(disabled){
    [insertBtn, deleteBtn, searchBtn, resetBtn, levelSelect].forEach(b=> b.disabled = disabled);
    [insertIndexEl, insertValueEl, deleteIndexEl, patternInputEl].forEach(i=> i.disabled = disabled);
    startBtn.disabled = disabled && timeMode;
  }

  // ---------- Operations ----------
  function opInsert(index, value){
    if(scanning || gameWon) return;
    if(!(Number.isInteger(index) && index>=0 && index<LEN)){
      say('⚠️ Index out of bounds! (0–9)');
      playBuzz(); flashSlots([clamp(index,0,LEN-1)], 'mismatch');
      return;
    }
    if(!(Number.isInteger(value) && value>=0 && value<=9)){
      say('⚠️ Enter a digit value between 0–9.');
      playBuzz(); return;
    }

    startTimer(false);

    const prev = captureRects();

    // Shift right from end to index
    for(let i=LEN-1;i>index;i--){
      slots[i] = slots[i-1];
    }
    // Drop last if full shift created overflow (implicit)
    slots[index] = createItem(value);

    renderSlots();
    animateFLIP(prev);

    playBeep();
    flashSlots([index], 'scan');
    say(`Inserted ${value} at index ${index}!`);

    autoCheckWin();
  }

  function opDelete(index){
    if(scanning || gameWon) return;
    if(!(Number.isInteger(index) && index>=0 && index<LEN)){
      say('⚠️ Index out of bounds! (0–9)');
      playBuzz(); flashSlots([clamp(index,0,LEN-1)], 'mismatch');
      return;
    }
    if(slots[index] === null){
      say(`⚠️ No element at index ${index} to delete.`);
      playBuzz(); flashSlots([index], 'mismatch');
      return;
    }

    startTimer(false);

    const prev = captureRects();

    // Remove and shift left
    for(let i=index;i<LEN-1;i++){
      slots[i] = slots[i+1];
    }
    slots[LEN-1] = null;

    renderSlots();
    animateFLIP(prev);

    playBeep();
    flashSlots([index], 'scan');
    say(`Deleted element at index ${index}.`);

    autoCheckWin();
  }

  function opSearch(patternStr){
    if(scanning) return;
    const pattern = parsePattern(patternStr);
    if(!pattern){
      say('⚠️ Enter a valid pattern (e.g., 1,2,3).');
      playBuzz(); return;
    }

    scanning = true;
    disableControls(true);
    say(`Searching for pattern [ ${pattern.join(', ')} ]…`);

    const vals = arrayValues().map(v => v===null? null : v);

    const k = pattern.length;
    let i = 0;

    const step = () => {
      // Clear previous scan classes
      document.querySelectorAll('.slot').forEach(s => s.classList.remove('scan','mismatch','match'));

      if(i + k > LEN){
        scanning = false;
        disableControls(false);
        say('Pattern not found.');
        playBuzz();
        return;
      }

      const windowIdx = Array.from({length:k}, (_,d) => i+d);
      flashSlots(windowIdx, 'scan', SCAN_DELAY);

      const slice = vals.slice(i, i+k);
      const ok = slice.every((v, idx) => v === pattern[idx]);

      if(ok){
        // success highlight
        windowIdx.forEach(ix => {
          const slot = grid.querySelector(`.slot:nth
