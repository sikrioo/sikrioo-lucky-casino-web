(function(){
"use strict";

/* ============================================================
   Utilities
   ============================================================ */
const $ = (sel, root) => (root||document).querySelector(sel);
const $$ = (sel, root) => Array.from((root||document).querySelectorAll(sel));
const wait = (ms) => new Promise(res => setTimeout(res, ms));
const fmt = (n) => n.toLocaleString('en-US');

/* ============================================================
   Storage abstraction: window.storage (artifact) -> localStorage -> memory
   ============================================================ */
const MemoryStore = {};
const Store = {
  async get(key){
    if (typeof window !== 'undefined' && window.storage){
      try{
        const r = await window.storage.get(key);
        return r ? JSON.parse(r.value) : null;
      }catch(e){ /* key missing or storage unavailable, fall through */ }
    }
    try{
      const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
      return v ? JSON.parse(v) : null;
    }catch(e){ return MemoryStore[key] !== undefined ? MemoryStore[key] : null; }
  },
  async set(key, value){
    MemoryStore[key] = value;
    if (typeof window !== 'undefined' && window.storage){
      try{ await window.storage.set(key, JSON.stringify(value)); return; }catch(e){ /* fall through */ }
    }
    try{ if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value)); }catch(e){ /* memory only */ }
  }
};

/* ============================================================
   Sound (Web Audio API synthesis — no external audio files)
   ============================================================ */
const Sound = (function(){
  let ctx = null;
  let enabled = !Casino.muted;
  function ensure(){
    if (!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, t0, dur, opts){
    opts = opts || {};
    const c = ensure(); if (!c || !enabled) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime + t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1,opts.slideTo), c.currentTime + t0 + dur);
    const peak = opts.gain !== undefined ? opts.gain : 0.12;
    gain.gain.setValueAtTime(0.0001, c.currentTime + t0);
    gain.gain.exponentialRampToValueAtTime(peak, c.currentTime + t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(c.currentTime + t0);
    osc.stop(c.currentTime + t0 + dur + 0.02);
  }
  function noiseBurst(t0, dur, opts){
    opts = opts || {};
    const c = ensure(); if (!c || !enabled) return;
    const bufSize = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufSize);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = opts.filterType || 'bandpass';
    filt.frequency.value = opts.freq || 2200;
    filt.Q.value = opts.q || 0.8;
    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.gain || 0.18, c.currentTime + t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start(c.currentTime + t0);
  }
  return {
    setEnabled(v){ enabled = v; if (v) ensure(); },
    isEnabled(){ return enabled; },
    cardDeal(){ noiseBurst(0, 0.09, {freq:2600, gain:0.14}); },
    cardFlip(){ noiseBurst(0, 0.12, {freq:1800, gain:0.16}); tone(700, 0.01, 0.05, {type:'triangle', gain:0.05}); },
    chip(){ tone(1200, 0, 0.06, {type:'triangle', gain:0.08, slideTo:900}); tone(1800, 0.03, 0.05, {type:'triangle', gain:0.05}); },
    button(){ tone(500, 0, 0.04, {type:'sine', gain:0.05}); },
    win(){ [523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f, i*0.09, 0.28, {type:'triangle', gain:0.09})); },
    blackjack(){ [523.25,659.25,783.99,987.77,1318.5].forEach((f,i)=>tone(f, i*0.075, 0.32, {type:'triangle', gain:0.1})); },
    lose(){ tone(300, 0, 0.22, {type:'sawtooth', gain:0.06, slideTo:170}); },
    bust(){ tone(180, 0, 0.32, {type:'sawtooth', gain:0.09, slideTo:60}); },
    push(){ tone(440, 0, 0.15, {type:'sine', gain:0.07}); tone(440, 0.14, 0.15, {type:'sine', gain:0.07}); },
    shuffle(){ noiseBurst(0, 0.5, {freq:1200, gain:0.1, q:0.4}); },
    tension(){ tone(70, 0, 0.16, {type:'sine', gain:0.14}); tone(58, 0.22, 0.2, {type:'sine', gain:0.12}); }
  };
})();

/* ============================================================
   Card model + shoe
   ============================================================ */
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = [
  {k:'S', sym:'♠', color:'black'},
  {k:'H', sym:'♥', color:'red'},
  {k:'D', sym:'♦', color:'red'},
  {k:'C', sym:'♣', color:'black'}
];
const NUM_DECKS = 6;

function makeShoe(numDecks){
  const shoe = [];
  let uid = 0;
  for (let d=0; d<numDecks; d++){
    for (const s of SUITS){
      for (const r of RANKS){
        const val = r==='A' ? 11 : (['J','Q','K'].includes(r) ? 10 : parseInt(r,10));
        shoe.push({rank:r, suit:s.k, sym:s.sym, color:s.color, value:val, uid: uid++});
      }
    }
  }
  return shoe;
}
function shuffle(arr){
  for (let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function handValue(cards){
  let total=0, aces=0;
  for (const c of cards){ total += c.value; if (c.rank==='A') aces++; }
  while (total>21 && aces>0){ total-=10; aces--; }
  const soft = aces>0 && total<=21;
  return {total, soft};
}
function isBlackjack(cards){ return cards.length===2 && handValue(cards).total===21; }
function isBust(cards){ return handValue(cards).total>21; }
function dealerShouldHit(cards){ return handValue(cards).total < 17; }

/* ---- Basic strategy engine (multi-deck, dealer stands soft17, DAS, late surrender) ---- */
function cardRankGroup(rank){
  if (rank==='A') return 'A';
  if (['10','J','Q','K'].includes(rank)) return '10';
  return rank;
}
function hardTotalStrategy(total, dNum, isAce, canDouble, canSurrender){
  const between = (lo,hi) => !isAce && dNum>=lo && dNum<=hi;
  if (total>=17) return 'S';
  if (total<=8) return 'H';
  if (total===9) return between(3,6) ? (canDouble?'D':'H') : 'H';
  if (total===10) return between(2,9) ? (canDouble?'D':'H') : 'H';
  if (total===11) return canDouble ? 'D' : 'H';
  if (total===12) return between(4,6) ? 'S' : 'H';
  if (total>=13 && total<=16){
    if (canSurrender){
      if (total===16 && (dNum===9||dNum===10||isAce)) return 'R';
      if (total===15 && dNum===10) return 'R';
    }
    return between(2,6) ? 'S' : 'H';
  }
  return 'S';
}
function softTotalStrategy(total, dNum, isAce, canDouble){
  const between = (lo,hi) => !isAce && dNum>=lo && dNum<=hi;
  switch(total){
    case 13: case 14: return between(5,6) ? (canDouble?'D':'H') : 'H';
    case 15: case 16: return between(4,6) ? (canDouble?'D':'H') : 'H';
    case 17: return between(3,6) ? (canDouble?'D':'H') : 'H';
    case 18:
      if (between(3,6)) return canDouble?'D':'H';
      if (dNum===2||dNum===7||dNum===8) return 'S';
      return 'H';
    default: return 'S';
  }
}
function basicStrategy(playerCards, dealerUpCard, opts){
  opts = opts||{};
  const canDouble = opts.canDouble !== false;
  const canSplit = opts.canSplit === true;
  const canSurrender = opts.canSurrender === true;
  const isAce = dealerUpCard.rank === 'A';
  const dNum = isAce ? 11 : dealerUpCard.value;
  const isPair = playerCards.length===2 && cardRankGroup(playerCards[0].rank)===cardRankGroup(playerCards[1].rank);

  if (isPair && canSplit){
    const group = cardRankGroup(playerCards[0].rank);
    const between = (lo,hi) => !isAce && dNum>=lo && dNum<=hi;
    if (group==='A') return 'P';
    if (group==='10') return 'S';
    if (group==='9') return (between(2,6)||between(8,9)) ? 'P' : 'S';
    if (group==='8') return 'P';
    if (group==='7') return between(2,7) ? 'P' : hardTotalStrategy(14,dNum,isAce,canDouble,canSurrender);
    if (group==='6') return between(2,6) ? 'P' : hardTotalStrategy(12,dNum,isAce,canDouble,canSurrender);
    if (group==='5') return hardTotalStrategy(10,dNum,isAce,canDouble,false);
    if (group==='4') return between(5,6) ? 'P' : hardTotalStrategy(8,dNum,isAce,canDouble,canSurrender);
    if (group==='3') return between(2,7) ? 'P' : hardTotalStrategy(6,dNum,isAce,canDouble,canSurrender);
    if (group==='2') return between(2,7) ? 'P' : hardTotalStrategy(4,dNum,isAce,canDouble,canSurrender);
  }
  const {total, soft} = handValue(playerCards);
  if (soft && playerCards.length===2) return softTotalStrategy(total, dNum, isAce, canDouble);
  return hardTotalStrategy(total, dNum, isAce, canDouble, canSurrender && playerCards.length===2);
}
const ACTION_LABEL = {H:'히트', S:'스탠드', D:'더블다운', P:'스플릿', R:'서렌더'};

/* ============================================================
   Game state
   ============================================================ */
const STARTING_BANKROLL = 1000;
const CHIP_VALUES = [5,25,100,500,1000,5000,25000];

const state = {
  shoe: [],
  shoeTotal: NUM_DECKS*52,
  cutIndex: Math.floor(NUM_DECKS*52*0.25), // reshuffle when remaining <= this
  bankroll: Casino.bank,
  currentBet: 0,
  lastBet: 0,
  selectedChip: 25,
  hands: [],
  activeHandIndex: 0,
  dealer: {cards: [], holeHidden:true},
  phase: 'betting', // betting | dealing | player | dealer | settle
  insurance: {offered:false, taken:false, bet:0},
  settings: {sound:true, advisor:false},
  stats: {played:0, wins:0, losses:0, pushes:0, blackjacks:0, biggestWin:0, streak:0, bestStreak:0}
};

function newHand(bet){
  return {cards:[], bet, status:'active', doubled:false, result:null, isSplitAces:false, done:false};
}

function needsReshuffle(){
  return state.shoe.length <= state.cutIndex;
}
function drawCard(){
  if (state.shoe.length===0) resetShoe(true);
  return state.shoe.pop();
}
function resetShoe(silent){
  state.shoe = shuffle(makeShoe(NUM_DECKS));
  state.shoeTotal = state.shoe.length;
  if (!silent) Sound.shuffle();
}

/* ============================================================
   DOM refs
   ============================================================ */
let dom = {};
function cacheDom(){
  dom = {
    bankrollValue: $('#bjLedWrap'),
    shoeGauge: $('#shoeGauge'),
    dealerHand: $('#dealerHand'),
    dealerTotal: $('#dealerTotal'),
    playerSeatArea: $('#playerSeatArea'),
    betAmount: $('#betAmount'),
    betChipStack: $('#betChipStack'),
    chipTray: $('#chipTray'),
    shoe: $('#shoe'),
    tableFelt: $('.table-felt'),
    zawaLayer: $('#zawaLayer'),
    btnClear: $('#btnClear'),
    btnRebet: $('#btnRebet'),
    btnDeal: $('#btnDeal'),
    betActions: $('#betActions'),
    playActions: $('#playActions'),
    btnHit: $('#btnHit'),
    btnStand: $('#btnStand'),
    btnDouble: $('#btnDouble'),
    btnSplit: $('#btnSplit'),
    btnSurrender: $('#btnSurrender'),
    advisor: $('#advisor'),
    insurancePrompt: $('#insurancePrompt'),
    drawer: $('#drawer'),
    drawerTab: $('#drawerTab'),
    drawerClose: $('#drawerClose'),
    scrim: $('#bjScrim'),
    toggleSound: $('#toggleSound'),
    toggleAdvisor: $('#toggleAdvisor'),
    statsGrid: $('#statsGrid'),
    btnResetStats: $('#btnResetStats'),
    btnResetBankroll: $('#btnResetBankroll'),
    toastLayer: $('#toastLayer')
  };
}

/* ============================================================
   Rendering
   ============================================================ */
let bjLed = null;
function renderBankroll(flash){
  if (!bjLed) bjLed = window.CasinoLED(document.getElementById('bjSeg'), 8);
  state.bankroll = Math.min(Casino.MAX, state.bankroll);
  bjLed(state.bankroll);
  if (Casino.bank !== state.bankroll) Casino.setBank(state.bankroll);
  if (flash){
    dom.bankrollValue.classList.remove('flash');
    void dom.bankrollValue.offsetWidth;
    dom.bankrollValue.classList.add('flash');
  }
}
function renderShoeGauge(){
  const pct = Math.max(0, Math.min(1, state.shoe.length / state.shoeTotal));
  dom.shoeGauge.style.height = (pct*100).toFixed(1)+'%';
  const df = document.getElementById('discardFill');
  if (df) df.style.height = ((1-pct)/0.75*100).toFixed(1)+'%';
}
function renderBetZone(){
  dom.betAmount.textContent = fmt(state.currentBet);
  dom.betAmount.style.opacity = state.currentBet>0 ? '0' : '1';
}
function renderChipTray(){
  dom.chipTray.innerHTML = '';
  CHIP_VALUES.forEach(v=>{
    const b = document.createElement('button');
    b.className = 'bchip' + (v===state.selectedChip?' selected':'');
    b.dataset.val = v;
    b.type = 'button';
    b.setAttribute('aria-label', `${v} 칩 베팅`);
    b.textContent = v>=1000 ? (v/1000)+'K' : v;
    b.addEventListener('click', ()=>onChipClick(v));
    dom.chipTray.appendChild(b);
  });
}
function renderControlsForPhase(){
  const betting = state.phase==='betting';
  dom.betActions.hidden = !betting;
  dom.playActions.hidden = betting;
  if (betting){
    dom.btnClear.disabled = state.currentBet<=0;
    dom.btnRebet.disabled = state.lastBet<=0 || state.lastBet>state.bankroll;
    dom.btnDeal.disabled = state.currentBet<=0;
  }
  dom.advisor.hidden = !(state.settings.advisor && state.phase==='player');
}
function renderAdvisor(){
  if (!state.settings.advisor || state.phase!=='player'){ dom.advisor.textContent=''; return; }
  const hand = state.hands[state.activeHandIndex];
  if (!hand) { dom.advisor.textContent=''; return; }
  const dealerUp = state.dealer.cards[0];
  const canDouble = hand.cards.length===2 && !hand.doubled && state.bankroll>=hand.bet;
  const canSplit = canSplitHand(hand);
  const canSurrender = canSurrenderHand(hand);
  const action = basicStrategy(hand.cards, dealerUp, {canDouble, canSplit, canSurrender});
  dom.advisor.textContent = `전략 어드바이저 — 권장: ${ACTION_LABEL[action]}`;
}

function cardFaceHTML(card){
  const colorClass = card.color==='red' ? ' red' : '';
  card = Object.assign({}, card, {sym: card.color==='red'
    ? `<span class="s-d">${card.sym}</span><span class="s-m">${card.suit==='H'?'♡':'♢'}</span>` : card.sym});
  return `
    <div class="card-face card-front${colorClass}">
      <div class="card-corner top"><span class="card-rank">${card.rank}</span><span class="card-suit-corner">${card.sym}</span></div>
      <span class="card-suit-center">${card.sym}</span>
      <div class="card-corner bottom"><span class="card-rank">${card.rank}</span><span class="card-suit-corner">${card.sym}</span></div>
    </div>
    <div class="card-face card-back"></div>
  `;
}

function buildCardSlot(card, faceUp){
  const slot = document.createElement('div');
  slot.className = 'card-slot';
  const inner = document.createElement('div');
  inner.className = 'card' + (faceUp ? '' : ' is-flipped');
  inner.innerHTML = cardFaceHTML(card);
  slot.appendChild(inner);
  return slot;
}

function ensureHandGroups(){
  dom.playerSeatArea.innerHTML = '';
  state.hands.forEach((hand, idx)=>{
    const grp = document.createElement('div');
    grp.className = 'hand-group';
    grp.dataset.idx = idx;
    grp.innerHTML = `
      <span class="mini-bet" data-role="bet">$${fmt(hand.bet)}</span>
      <div class="seat-label">핸드 ${state.hands.length>1?(idx+1):''} <span class="hand-total" data-role="total"></span></div>
      <div class="hand" data-role="cards"></div>
      <div class="result-banner" data-role="banner"></div>
    `;
    dom.playerSeatArea.appendChild(grp);
  });
}

function updateHandTotals(){
  state.hands.forEach((hand, idx)=>{
    const grp = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`);
    if (!grp) return;
    const {total, soft} = handValue(hand.cards);
    const totalEl = grp.querySelector('[data-role="total"]');
    if (hand.cards.length){
      totalEl.textContent = isBust(hand.cards) ? `${total} 버스트` : (soft ? `${total} (소프트)` : `${total}`);
    } else {
      totalEl.textContent = '';
    }
    grp.classList.toggle('active', idx===state.activeHandIndex && state.phase==='player');
    grp.classList.toggle('busted', isBust(hand.cards));
  });
  if (state.dealer.cards.length){
    if (state.dealer.holeHidden){
      dom.dealerTotal.textContent = handValue([state.dealer.cards[0]]).total;
    } else {
      const {total} = handValue(state.dealer.cards);
      dom.dealerTotal.textContent = isBust(state.dealer.cards) ? `${total} 버스트` : total;
    }
  } else {
    dom.dealerTotal.textContent = '';
  }
}

function showBanner(idx, kind, text){
  const grp = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`);
  if (!grp) return;
  const banner = grp.querySelector('[data-role="banner"]');
  banner.textContent = text;
  banner.className = `result-banner show ${kind}`;
}

function toast(msg){ Casino.toast(msg); }
function toastOld(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  dom.toastLayer.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{
    t.classList.remove('show');
    setTimeout(()=>t.remove(), 350);
  }, 2200);
}

function triggerZawazawa(durationMs){
  if (!dom.zawaLayer) return;
  if (dom.zawaLayer.childElementCount === 0){
    for (let i=0;i<12;i++){
      const w = document.createElement('span');
      w.className = 'zawa-word';
      w.textContent = 'ざわ…';
      w.style.left = (Math.random()*86+2) + '%';
      w.style.top = (Math.random()*80+4) + '%';
      const rot = (Math.random()*16-8).toFixed(1);
      w.style.setProperty('--r', rot+'deg');
      w.style.animationDelay = (Math.random()*1.6).toFixed(2)+'s';
      dom.zawaLayer.appendChild(w);
    }
  }
  dom.zawaLayer.classList.add('active');
  Sound.tension();
  clearTimeout(dom.zawaLayer._timer);
  dom.zawaLayer._timer = setTimeout(()=>{ dom.zawaLayer.classList.remove('active'); }, durationMs || 2200);
}

function triggerImpactFlash(){
  if (!dom.tableFelt) return;
  dom.tableFelt.classList.remove('impact');
  void dom.tableFelt.offsetWidth;
  dom.tableFelt.classList.add('impact');
  setTimeout(()=> dom.tableFelt.classList.remove('impact'), 550);
}

function spawnFlick(fromEl){
  const rect = fromEl.getBoundingClientRect();
  const colors = Casino.theme==='74' ? ['#000','#fff'] : ['#ffd36b','#e0182b','#23d5c8','#ff6bd5','#fff'];
  for (let i=0;i<14;i++){
    const p = document.createElement('div');
    p.className = 'flick';
    p.style.left = (rect.left + rect.width/2) + 'px';
    p.style.top = (rect.top + rect.height/2) + 'px';
    p.style.background = colors[i%colors.length];
    document.body.appendChild(p);
    const angle = Math.random()*Math.PI*2;
    const dist = 60 + Math.random()*90;
    const dx = Math.cos(angle)*dist;
    const dy = Math.sin(angle)*dist - 40;
    const rot = (Math.random()*360)|0;
    p.animate([
      {transform:'translate(0,0) rotate(0deg)', opacity:1},
      {transform:`translate(${dx}px, ${dy+140}px) rotate(${rot}deg)`, opacity:0}
    ], {duration: 900+Math.random()*400, easing:'cubic-bezier(.2,.7,.3,1)'});
    setTimeout(()=>p.remove(), 1400);
  }
}

/* ============================================================
   FLIP-style fly animations
   ============================================================ */
function flyFrom(el, originRect){
  const finalRect = el.getBoundingClientRect();
  const dx = originRect.left - finalRect.left + (originRect.width-finalRect.width)/2;
  const dy = originRect.top - finalRect.top + (originRect.height-finalRect.height)/2;
  el.classList.add('no-anim');
  el.style.transform = `translate(${dx}px, ${dy}px) rotate(-18deg) scale(0.7)`;
  el.style.opacity = '0.9';
  // force reflow
  void el.offsetWidth;
  requestAnimationFrame(()=>{
    el.classList.remove('no-anim');
    el.style.transform = '';
    el.style.opacity = '1';
  });
}

async function dealCardToHand(handEl, card, faceUp){
  const slot = buildCardSlot(card, faceUp);
  handEl.appendChild(slot);
  const shoeRect = dom.shoe.getBoundingClientRect();
  flyFrom(slot, shoeRect);
  Sound.cardDeal();
  await wait(260);
  return slot;
}

async function animateChipToBet(value, originEl){
  const chip = document.createElement('div');
  chip.className = 'bchip mini';
  chip.dataset.val = value;
  chip.style.setProperty('--i', Math.min(dom.betChipStack.childElementCount, 10));
  chip.textContent = value>=1000 ? (value/1000)+'K' : value;
  dom.betChipStack.appendChild(chip);
  const originRect = originEl.getBoundingClientRect();
  flyFrom(chip, originRect);
  Sound.chip();
}

/* ============================================================
   Split / surrender eligibility
   ============================================================ */
function canSplitHand(hand){
  if (!hand || hand.cards.length!==2) return false;
  if (state.hands.length>=4) return false;
  if (hand.isSplitAces) return false;
  const g1 = cardRankGroup(hand.cards[0].rank), g2 = cardRankGroup(hand.cards[1].rank);
  return g1===g2 && state.bankroll>=hand.bet;
}
function canSurrenderHand(hand){
  if (!hand) return false;
  return hand.cards.length===2 && state.hands.length===1 && !hand.isSplitAces;
}
function canDoubleHand(hand){
  if (!hand) return false;
  return hand.cards.length===2 && !hand.doubled && !hand.isSplitAces && state.bankroll>=hand.bet;
}

/* ============================================================
   Core flow
   ============================================================ */
function onChipClick(value){
  state.selectedChip = value;
  renderChipTray();
  if (state.phase!=='betting') return;
  if (value > state.bankroll - state.currentBet){
    toast('칩이 부족합니다');
    return;
  }
  state.currentBet += value;
  state.bankroll -= value;
  renderBankroll();
  renderBetZone();
  renderControlsForPhase();
  const originEl = dom.chipTray.querySelector(`.bchip[data-val="${value}"]`);
  animateChipToBet(value, originEl || dom.chipTray);
}

function clearBet(){
  if (state.phase!=='betting' || state.currentBet<=0) return;
  state.bankroll += state.currentBet;
  state.currentBet = 0;
  dom.betChipStack.innerHTML = '';
  renderBankroll();
  renderBetZone();
  renderControlsForPhase();
}

function rebet(){
  if (state.phase!=='betting' || state.lastBet<=0) return;
  if (state.lastBet > state.bankroll - state.currentBet){ toast('뱅크롤이 부족합니다'); return; }
  state.currentBet += state.lastBet;
  state.bankroll -= state.lastBet;
  renderBankroll();
  renderBetZone();
  renderControlsForPhase();
  let v = CHIP_VALUES[0];
  CHIP_VALUES.forEach(c => { if (c <= state.lastBet) v = c; });
  animateChipToBet(v, dom.btnRebet);
}

async function startDeal(){
  if (state.phase!=='betting' || state.currentBet<=0) return;
  if (needsReshuffle()){ resetShoe(); toast('셔플: 새 슈를 사용합니다'); await wait(400); }

  state.phase = 'dealing';
  renderControlsForPhase();
  state.lastBet = state.currentBet;
  state.hands = [newHand(state.currentBet)];
  state.dealer = {cards:[], holeHidden:true};
  state.activeHandIndex = 0;
  state.insurance = {offered:false, taken:false, bet:0};
  ensureHandGroups();

  const handEl = () => dom.playerSeatArea.querySelector('.hand-group[data-idx="0"] [data-role="cards"]');

  const c1 = drawCard(); state.hands[0].cards.push(c1);
  await dealCardToHand(handEl(), c1, true);
  updateHandTotals(); renderShoeGauge();

  const d1 = drawCard(); state.dealer.cards.push(d1);
  await dealCardToHand(dom.dealerHand, d1, true);
  updateHandTotals(); renderShoeGauge();

  const c2 = drawCard(); state.hands[0].cards.push(c2);
  await dealCardToHand(handEl(), c2, true);
  updateHandTotals(); renderShoeGauge();

  const d2 = drawCard(); state.dealer.cards.push(d2);
  await dealCardToHand(dom.dealerHand, d2, false);
  updateHandTotals(); renderShoeGauge();

  await wait(150);
  await afterInitialDeal();
}

async function afterInitialDeal(){
  const dealerUp = state.dealer.cards[0];
  const playerHand = state.hands[0];
  const playerBJ = isBlackjack(playerHand.cards);

  if (dealerUp.rank==='A'){
    await offerInsurance(playerBJ);
    return;
  }
  if (dealerUp.value===10){
    // peek for dealer blackjack (no insurance offered on ten)
    if (isBlackjack(state.dealer.cards)){
      await revealDealerAndSettle();
      return;
    }
  }
  if (playerBJ){
    await revealDealerAndSettle(); // dealer has no blackjack possible here (already peeked ten/ace paths above)
    return;
  }
  beginPlayerTurn();
}

async function offerInsurance(playerBJ){
  state.insurance.offered = true;
  triggerZawazawa(3200);
  dom.insurancePrompt.hidden = false;
  dom.insurancePrompt.innerHTML = `
    <div class="insurance-card">
      <h3>인슈어런스</h3>
      <p>딜러의 업카드가 에이스입니다. 원래 베팅의 절반(＄${fmt(Math.floor(state.hands[0].bet/2))})을 인슈어런스에 거시겠습니까? 딜러가 블랙잭이면 2:1로 지급됩니다.${playerBJ ? '<br><br>당신은 블랙잭입니다 — "이븐머니"를 선택하면 1:1로 즉시 확정 지급됩니다.' : ''}</p>
      <div class="row">
        ${playerBJ ? '<button class="bbtn primary" id="btnEvenMoney">이븐머니</button>' : ''}
        <button class="bbtn" id="btnInsureYes">보험 든다</button>
        <button class="bbtn ghost" id="btnInsureNo">사양한다</button>
      </div>
    </div>`;
  return new Promise(resolve=>{
    const cleanup = ()=>{ dom.insurancePrompt.hidden = true; dom.insurancePrompt.innerHTML=''; };
    const evenBtn = $('#btnEvenMoney');
    if (evenBtn) evenBtn.addEventListener('click', async ()=>{
      cleanup();
      const bet = state.hands[0].bet;
      const payout = bet + Math.floor(bet*1.0);
      state.bankroll += payout;
      state.hands[0].result = 'even-money';
      state.hands[0].done = true;
      recordStat('win', Math.floor(bet*1.0));
      renderBankroll(true);
      showBanner(0, 'win', '이븐머니');
      Sound.win();
      await wait(900);
      await finishRound();
      resolve();
    });
    $('#btnInsureYes').addEventListener('click', async ()=>{
      const bet = Math.floor(state.hands[0].bet/2);
      if (bet > state.bankroll){ toast('뱅크롤이 부족합니다'); return; }
      state.insurance.taken = true;
      state.insurance.bet = bet;
      state.bankroll -= bet;
      renderBankroll(true);
      cleanup();
      await proceedAfterInsuranceDecision(playerBJ);
      resolve();
    });
    $('#btnInsureNo').addEventListener('click', async ()=>{
      cleanup();
      await proceedAfterInsuranceDecision(playerBJ);
      resolve();
    });
  });
}

async function proceedAfterInsuranceDecision(playerBJ){
  const dealerBJ = isBlackjack(state.dealer.cards);
  if (state.insurance.taken){
    if (dealerBJ){
      const payout = state.insurance.bet*3; // return stake + 2:1
      state.bankroll += payout;
      toast(`인슈어런스 적중! +$${fmt(payout-state.insurance.bet)}`);
    }
    renderBankroll(true);
  }
  if (dealerBJ || playerBJ){
    await revealDealerAndSettle();
    return;
  }
  beginPlayerTurn();
}

function beginPlayerTurn(){
  state.phase = 'player';
  state.activeHandIndex = 0;
  renderControlsForPhase();
  updateHandTotals();
  updateActionButtons();
  renderAdvisor();
}

function updateActionButtons(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand){ return; }
  const busted = isBust(hand.cards);
  dom.btnHit.disabled = busted || hand.done;
  dom.btnStand.disabled = busted || hand.done;
  dom.btnDouble.disabled = !canDoubleHand(hand) || hand.done;
  dom.btnSplit.disabled = !canSplitHand(hand) || hand.done;
  dom.btnSurrender.disabled = !canSurrenderHand(hand) || hand.done;
}

async function playerHit(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand || hand.done) return;
  const card = drawCard();
  hand.cards.push(card);
  const handEl = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${state.activeHandIndex}"] [data-role="cards"]`);
  await dealCardToHand(handEl, card, true);
  updateHandTotals(); renderShoeGauge();
  if (isBust(hand.cards)){
    hand.done = true;
    hand.status = 'bust';
    const grp = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${state.activeHandIndex}"]`);
    grp.classList.add('shake');
    showBanner(state.activeHandIndex, 'bust', '버스트');
    Sound.bust();
    triggerImpactFlash();
    await wait(500);
    await advanceHand();
    return;
  }
  const {total} = handValue(hand.cards);
  if (total===21){ await playerStand(); return; }
  updateActionButtons();
  renderAdvisor();
}

async function playerStand(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand || hand.done) return;
  hand.done = true;
  hand.status = 'stand';
  await advanceHand();
}

async function playerDouble(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand || !canDoubleHand(hand)) return;
  state.bankroll -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  renderBankroll(true);
  const grp = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${state.activeHandIndex}"]`);
  grp.querySelector('[data-role="bet"]').textContent = `$${fmt(hand.bet)}`;
  const card = drawCard();
  hand.cards.push(card);
  const handEl = grp.querySelector('[data-role="cards"]');
  await dealCardToHand(handEl, card, true);
  updateHandTotals(); renderShoeGauge();
  hand.done = true;
  hand.status = isBust(hand.cards) ? 'bust' : 'stand';
  if (hand.status==='bust'){
    grp.classList.add('shake');
    showBanner(state.activeHandIndex, 'bust', '버스트');
    Sound.bust();
    triggerImpactFlash();
    await wait(500);
  }
  await advanceHand();
}

async function dealOpeningCardToHand(idx){
  const hand = state.hands[idx];
  if (!hand || hand.cards.length!==1) return; // only relevant for a hand just created by a split
  const card = drawCard();
  hand.cards.push(card);
  const el = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"] [data-role="cards"]`);
  await dealCardToHand(el, card, true);
  updateHandTotals(); renderShoeGauge();

  if (hand.isSplitAces){
    hand.done = true;
    hand.status = 'stand';
  } else if (isBust(hand.cards)){
    hand.done = true;
    hand.status = 'bust';
    const grp = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`);
    grp.classList.add('shake');
    showBanner(idx, 'bust', '버스트');
    Sound.bust();
    triggerImpactFlash();
    await wait(500);
  } else if (handValue(hand.cards).total===21){
    hand.done = true;
    hand.status = 'stand';
  }
}

async function playerSplit(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand || !canSplitHand(hand)) return;
  state.bankroll -= hand.bet;
  renderBankroll(true);
  const isAcePair = hand.cards[0].rank==='A';
  const moved = hand.cards.pop();
  const newH = newHand(hand.bet);
  newH.cards.push(moved);
  newH.isSplitAces = isAcePair;
  hand.isSplitAces = isAcePair;
  state.hands.splice(state.activeHandIndex+1, 0, newH);
  ensureHandGroups();
  // redraw existing cards without animation (rebuild), then deal the opening card to the active hand
  state.hands.forEach((h, idx)=>{
    const cardsEl = dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"] [data-role="cards"]`);
    cardsEl.innerHTML = '';
    h.cards.forEach(c => cardsEl.appendChild(buildCardSlot(c, true)));
    dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"] [data-role="bet"]`).textContent = `$${fmt(h.bet)}`;
  });
  updateHandTotals();

  await dealOpeningCardToHand(state.activeHandIndex);
  updateActionButtons();
  renderAdvisor();
  if (state.hands[state.activeHandIndex].done) await advanceHand();
}

async function playerSurrender(){
  const hand = state.hands[state.activeHandIndex];
  if (!hand || !canSurrenderHand(hand)) return;
  hand.done = true;
  hand.status = 'surrender';
  const refund = Math.floor(hand.bet/2);
  state.bankroll += refund;
  renderBankroll(true);
  showBanner(state.activeHandIndex, 'surrender', '서렌더');
  await wait(500);
  await advanceHand();
}

async function advanceHand(){
  const next = state.hands.findIndex((h, idx) => idx>state.activeHandIndex && !h.done);
  if (next!==-1){
    state.activeHandIndex = next;
    updateHandTotals();
    // a hand created by a split only has one card until it's actually its turn
    if (state.hands[next].cards.length===1){
      await dealOpeningCardToHand(next);
      if (state.hands[next].done){
        await advanceHand();
        return;
      }
    }
    updateHandTotals();
    updateActionButtons();
    renderAdvisor();
    return;
  }
  await revealDealerAndSettle();
}

/* ============================================================
   Dealer play + settlement
   ============================================================ */
async function revealDealerAndSettle(){
  state.phase = 'dealer';
  renderControlsForPhase();
  dom.advisor.textContent = '';

  const dealerAlreadyResolved = state.hands.every(h => isBust(h.cards) || h.status==='surrender' || h.result==='even-money');
  if (!dealerAlreadyResolved){
    triggerZawazawa(1400);
    await wait(450);
  }
  const holeSlot = dom.dealerHand.querySelectorAll('.card-slot')[1];
  if (holeSlot){
    const inner = holeSlot.querySelector('.card');
    Sound.cardFlip();
    inner.classList.remove('is-flipped');
  }
  state.dealer.holeHidden = false;
  await wait(560);
  updateHandTotals();

  // Skip the dealer's extra hits when no live hand can still be affected by them: every
  // hand is already bust/surrendered/settled, or it's a single unbeaten natural blackjack
  // (a real table doesn't keep drawing once every hand's outcome is already fixed).
  const dealerHasBJ = isBlackjack(state.dealer.cards);
  const allResolved = state.hands.every(h =>
    isBust(h.cards) || h.status==='surrender' || h.result==='even-money' ||
    (state.hands.length===1 && isBlackjack(h.cards) && !dealerHasBJ)
  );
  if (!allResolved){
    while (dealerShouldHit(state.dealer.cards)){
      triggerZawazawa(1300);
      await wait(500);
      const card = drawCard();
      state.dealer.cards.push(card);
      await dealCardToHand(dom.dealerHand, card, true);
      updateHandTotals(); renderShoeGauge();
    }
    await wait(350);
  }
  await settleAllHands();
}

function recordStat(outcome, amount){
  state.stats.played++;
  if (outcome==='win'){
    state.stats.wins++;
    state.stats.streak = Math.max(0, state.stats.streak)+1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
    if (amount>state.stats.biggestWin) state.stats.biggestWin = amount;
  } else if (outcome==='loss'){
    state.stats.losses++;
    state.stats.streak = Math.min(0, state.stats.streak)-1;
  } else if (outcome==='push'){
    state.stats.pushes++;
    state.stats.streak = 0;
  }
}

async function settleAllHands(){
  const dealerBust = isBust(state.dealer.cards);
  const dealerTotal = handValue(state.dealer.cards).total;
  const dealerBJ = isBlackjack(state.dealer.cards);

  for (let idx=0; idx<state.hands.length; idx++){
    const hand = state.hands[idx];
    if (hand.result==='even-money') continue; // already settled pre-emptively
    if (hand.status==='surrender') continue; // already settled

    if (isBust(hand.cards)){
      recordStat('loss', 0);
      continue; // chips already lost when bet was placed
    }

    const playerBJ = isBlackjack(hand.cards) && state.hands.length===1 && !hand.doubled;
    const playerTotal = handValue(hand.cards).total;

    if (playerBJ && !dealerBJ){
      const payout = hand.bet + Math.floor(hand.bet*1.5);
      state.bankroll += payout;
      state.stats.blackjacks++;
      recordStat('win', Math.floor(hand.bet*1.5));
      showBanner(idx, 'blackjack', '블랙잭!');
      Sound.blackjack();
      spawnFlick(dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`));
      dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`).classList.add('win-glow');
      continue;
    }
    if (playerBJ && dealerBJ){
      state.bankroll += hand.bet;
      recordStat('push', 0);
      showBanner(idx, 'push', '푸시');
      Sound.push();
      continue;
    }
    if (dealerBJ){
      recordStat('loss', 0);
      showBanner(idx, 'lose', '패배');
      continue;
    }
    if (dealerBust || playerTotal>dealerTotal){
      const payout = hand.bet*2;
      state.bankroll += payout;
      recordStat('win', hand.bet);
      showBanner(idx, 'win', dealerBust ? '승리 (딜러 버스트)' : '승리');
      Sound.win();
      spawnFlick(dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`));
      dom.playerSeatArea.querySelector(`.hand-group[data-idx="${idx}"]`).classList.add('win-glow');
      continue;
    }
    if (playerTotal===dealerTotal){
      state.bankroll += hand.bet;
      recordStat('push', 0);
      showBanner(idx, 'push', '푸시');
      Sound.push();
      continue;
    }
    recordStat('loss', 0);
    showBanner(idx, 'lose', '패배');
    Sound.lose();
  }

  renderBankroll(true);
  renderStats();
  await persistState();
  await wait(1400);
  await finishRound();
}

async function finishRound(){
  state.phase = 'betting';
  state.currentBet = 0;
  dom.betChipStack.innerHTML = '';
  state.activeHandIndex = 0;
  renderBetZone();
  renderControlsForPhase();
  renderShoeGauge();
  await persistState();
  if (state.bankroll<=0 && CHIP_VALUES[0]>0){
    toast('칩이 모두 소진됐어요 · 로비 ATM에서 충전하세요');
  }
}

/* ============================================================
   Stats / settings rendering + persistence
   ============================================================ */
function renderStats(){
  const s = state.stats;
  const winRate = s.played ? Math.round((s.wins/s.played)*100) : 0;
  dom.statsGrid.innerHTML = `
    <div class="stat-box"><div class="v">${s.played}</div><div class="l">핸드 수</div></div>
    <div class="stat-box"><div class="v">${winRate}%</div><div class="l">승률</div></div>
    <div class="stat-box"><div class="v">${s.wins}</div><div class="l">승</div></div>
    <div class="stat-box"><div class="v">${s.losses}</div><div class="l">패</div></div>
    <div class="stat-box"><div class="v">${s.pushes}</div><div class="l">푸시</div></div>
    <div class="stat-box"><div class="v">${s.blackjacks}</div><div class="l">블랙잭</div></div>
    <div class="stat-box"><div class="v">$${fmt(s.biggestWin)}</div><div class="l">최대 획득</div></div>
    <div class="stat-box"><div class="v">${s.bestStreak}</div><div class="l">최고 연승</div></div>
  `;
}

async function persistState(){
  await Store.set('casino-bj', {
    lastBet: state.lastBet,
    stats: state.stats,
    settings: state.settings
  });
}

async function loadState(){
  const saved = await Store.get('casino-bj');
  if (saved){
    if (typeof saved.lastBet==='number') state.lastBet = saved.lastBet;
    if (saved.stats) Object.assign(state.stats, saved.stats);
    if (saved.settings) Object.assign(state.settings, saved.settings);
  }
}

/* ============================================================
   Drawer + settings wiring
   ============================================================ */
function openDrawer(){
  dom.drawer.classList.add('open');
  dom.scrim.hidden = false;
  requestAnimationFrame(()=>dom.scrim.classList.add('open'));
}
function closeDrawer(){
  dom.drawer.classList.remove('open');
  dom.scrim.classList.remove('open');
  setTimeout(()=>{ dom.scrim.hidden = true; }, 300);
}

function wireEvents(){
  dom.btnClear.addEventListener('click', clearBet);
  dom.btnRebet.addEventListener('click', rebet);
  dom.btnDeal.addEventListener('click', ()=>{ Sound.button(); startDeal(); });
  dom.btnHit.addEventListener('click', ()=>{ Sound.button(); playerHit(); });
  dom.btnStand.addEventListener('click', ()=>{ Sound.button(); playerStand(); });
  dom.btnDouble.addEventListener('click', ()=>{ Sound.button(); playerDouble(); });
  dom.btnSplit.addEventListener('click', ()=>{ Sound.button(); playerSplit(); });
  dom.btnSurrender.addEventListener('click', ()=>{ Sound.button(); playerSurrender(); });

  dom.drawerTab.addEventListener('click', openDrawer);
  dom.drawerClose.addEventListener('click', closeDrawer);
  dom.scrim.addEventListener('click', closeDrawer);

  dom.toggleSound.addEventListener('change', (e)=>{ Casino.setMuted(!e.target.checked); });
  Casino.onSound(()=>{ Sound.setEnabled(!Casino.muted); dom.toggleSound.checked = !Casino.muted; });
  const monoT = $('#toggleMono'), subEl = $('#bjSub');
  const syncTheme = ()=>{ monoT.checked = Casino.theme==='74'; subEl.textContent = Casino.theme==='74' ? 'blackjack · 6 deck' : 'Blackjack'; };
  monoT.addEventListener('change', (e)=> Casino.setTheme(e.target.checked ? '74' : '86'));
  Casino.onTheme(syncTheme); syncTheme();
  $('#bjBack').addEventListener('click', ()=> Casino.go('lobby'));
  dom.toggleAdvisor.addEventListener('change', (e)=>{
    state.settings.advisor = e.target.checked;
    renderControlsForPhase();
    renderAdvisor();
    persistState();
  });
  dom.btnResetStats.addEventListener('click', ()=>{
    state.stats = {played:0, wins:0, losses:0, pushes:0, blackjacks:0, biggestWin:0, streak:0, bestStreak:0};
    renderStats();
    persistState();
    toast('통계가 초기화되었습니다');
  });
  dom.btnResetBankroll.addEventListener('click', ()=>{
    if (state.phase!=='betting') return;
    state.bankroll = STARTING_BANKROLL;
    state.currentBet = 0;
    dom.betChipStack.innerHTML = '';
    renderBankroll(true);
    renderBetZone();
    renderControlsForPhase();
    persistState();
    toast('뱅크롤이 리셋되었습니다');
  });
}

/* ============================================================
   Init
   ============================================================ */
function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_, reject)=> setTimeout(()=>reject(new Error('storage timed out')), ms))
  ]);
}

async function init(){
  cacheDom();
  resetShoe(true);

  // Render the table and wire every control FIRST, using safe defaults, so the game
  // is immediately playable no matter what happens with save-data loading below.
  Sound.setEnabled(!Casino.muted);
  dom.toggleSound.checked = !Casino.muted;
  dom.toggleAdvisor.checked = state.settings.advisor;
  renderChipTray();
  renderBankroll();
  renderBetZone();
  renderShoeGauge();
  renderStats();
  renderControlsForPhase();
  ensureHandGroups();
  wireEvents();
  // resume audio context on first interaction (browser autoplay policy)
  const resumeOnce = ()=>{ if (!Casino.muted) Sound.setEnabled(true); document.removeEventListener('pointerdown', resumeOnce); };
  document.addEventListener('pointerdown', resumeOnce);

  // Now try to restore a saved bankroll/stats/settings in the background. This is guarded
  // by a timeout so a slow or unresponsive storage backend can never freeze the game itself
  // (previously this was awaited before the UI was wired up at all, which could leave every
  // control inert if the storage call stalled).
  try{
    await withTimeout(loadState(), 1500);
    Sound.setEnabled(!Casino.muted);
    dom.toggleSound.checked = !Casino.muted;
    dom.toggleAdvisor.checked = state.settings.advisor;
    renderBankroll();
    renderBetZone();
    renderControlsForPhase();
    renderStats();
  }catch(e){
    // saved state unavailable or too slow to load in time; continue with fresh defaults
  }
}

if (document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

Casino.register('blackjack', {
  title: ()=> Casino.theme==='74' ? 'table nº 7 — blackjack' : 'TABLE Nº 7 — Blackjack',
  enter(){
    if (state.phase==='betting'){
      state.bankroll = Casino.bank; state.currentBet = 0;
      dom.betChipStack.innerHTML = '';
      renderBankroll(); renderBetZone(); renderControlsForPhase();
    }
  },
  canLeave: ()=> state.phase==='betting' && dom.insurancePrompt.hidden,
  leave(){ clearBet(); closeDrawer(); }
});

// expose for debugging / testing
window.__bj = {state, basicStrategy, handValue, isBlackjack, isBust};

})();
