(() => {
/* ---------- symbols ---------- */
const barRect = (y,h,fs) => `<rect x="8" y="${y}" width="84" height="${h}" rx="5" fill="#111" stroke="#e8b84a" stroke-width="3"/><text x="50" y="${y+h/2+fs*0.36}" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="${fs}" fill="#fff">BAR</text>`;
const SVG = {
  cherry:`<svg viewBox="0 0 100 100"><path d="M54 16C48 34 38 46 32 58" stroke="#2f7a1f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M54 16C60 34 66 46 70 56" stroke="#2f7a1f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M54 16C66 4 86 8 90 20C76 26 62 24 54 16Z" fill="#3fa34d" stroke="#1f5a22" stroke-width="2"/><circle cx="31" cy="69" r="19" fill="url(#gRed)" stroke="#5a0006" stroke-width="2"/><circle cx="70" cy="67" r="19" fill="url(#gRed)" stroke="#5a0006" stroke-width="2"/><ellipse cx="24" cy="62" rx="5" ry="3.5" fill="#fff" opacity=".75"/><ellipse cx="63" cy="60" rx="5" ry="3.5" fill="#fff" opacity=".75"/></svg>`,
  lemon:`<svg viewBox="0 0 100 100"><g transform="rotate(-22 50 52)"><circle cx="14" cy="52" r="6" fill="#d9a800"/><circle cx="86" cy="52" r="6" fill="#d9a800"/><ellipse cx="50" cy="52" rx="38" ry="28" fill="url(#gYel)" stroke="#9c7400" stroke-width="2.5"/><ellipse cx="38" cy="40" rx="12" ry="5" fill="#fff" opacity=".7"/></g></svg>`,
  orange:`<svg viewBox="0 0 100 100"><circle cx="50" cy="56" r="34" fill="url(#gOra)" stroke="#8a3c00" stroke-width="2.5"/><path d="M50 22C52 14 58 10 66 10C64 18 58 22 50 22Z" fill="#3fa34d"/><ellipse cx="38" cy="42" rx="10" ry="6" fill="#fff" opacity=".6"/></svg>`,
  bell:`<svg viewBox="0 0 100 100"><circle cx="50" cy="12" r="6" fill="url(#gGold)" stroke="#7a4a00" stroke-width="2"/><circle cx="50" cy="84" r="9" fill="url(#gGold)" stroke="#7a4a00" stroke-width="2"/><path d="M50 16C30 16 26 36 26 50C26 64 20 70 12 78L88 78C80 70 74 64 74 50C74 36 70 16 50 16Z" fill="url(#gGold)" stroke="#7a4a00" stroke-width="2.5"/><path d="M22 70H78" stroke="#7a4a00" stroke-width="3"/><path d="M38 28C34 36 33 46 33 56" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/></svg>`,
  bar1:`<svg viewBox="0 0 100 100">${barRect(32,36,24)}</svg>`,
  bar2:`<svg viewBox="0 0 100 100">${barRect(16,32,20)}${barRect(54,32,20)}</svg>`,
  bar3:`<svg viewBox="0 0 100 100">${barRect(8,26,16)}${barRect(37,26,16)}${barRect(66,26,16)}</svg>`,
  seven:`<svg viewBox="0 0 100 100"><text x="50" y="88" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="96" fill="url(#gSeven)" stroke="#e8b84a" stroke-width="5" paint-order="stroke" stroke-linejoin="round">7</text></svg>`
};
const barM = (y,h,fs) => `<rect x="10" y="${y}" width="80" height="${h}" rx="2" fill="#000"/><text x="50" y="${y+h/2+fs*0.36}" text-anchor="middle" font-family="'Archivo Black',Arial,sans-serif" font-size="${fs}" fill="#fff" letter-spacing="1">BAR</text>`;
const SVG_MONO = {
  cherry:`<svg viewBox="0 0 100 100"><path d="M54 16C48 34 38 46 32 58M54 16C60 34 66 46 70 56" stroke="#000" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M54 16C66 4 86 8 90 20C76 26 62 24 54 16Z" fill="#000"/><circle cx="31" cy="69" r="18" fill="#000"/><circle cx="70" cy="67" r="18" fill="#000"/><circle cx="25" cy="63" r="4" fill="#fff"/><circle cx="64" cy="61" r="4" fill="#fff"/></svg>`,
  lemon:`<svg viewBox="0 0 100 100"><g transform="rotate(-22 50 52)"><circle cx="13" cy="52" r="5" fill="#000"/><circle cx="87" cy="52" r="5" fill="#000"/><ellipse cx="50" cy="52" rx="36" ry="25" fill="#fff" stroke="#000" stroke-width="4"/><path d="M30 44Q45 35 62 39" stroke="#000" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg>`,
  orange:`<svg viewBox="0 0 100 100"><circle cx="50" cy="54" r="36" fill="#fff" stroke="#000" stroke-width="4"/><circle cx="50" cy="54" r="27" fill="none" stroke="#000" stroke-width="2"/><path d="M23 54H77M36.5 30.6L63.5 77.4M63.5 30.6L36.5 77.4" stroke="#000" stroke-width="2"/><circle cx="50" cy="54" r="4" fill="#000"/></svg>`,
  bell:`<svg viewBox="0 0 100 100"><circle cx="50" cy="12" r="6" fill="#000"/><circle cx="50" cy="84" r="9" fill="#000"/><path d="M50 16C30 16 26 36 26 50C26 64 20 70 12 78L88 78C80 70 74 64 74 50C74 36 70 16 50 16Z" fill="#000"/><path d="M38 28C34 36 33 46 33 58" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`,
  bar1:`<svg viewBox="0 0 100 100">${barM(33,34,22)}</svg>`,
  bar2:`<svg viewBox="0 0 100 100">${barM(17,30,18)}${barM(53,30,18)}</svg>`,
  bar3:`<svg viewBox="0 0 100 100">${barM(9,24,15)}${barM(38,24,15)}${barM(67,24,15)}</svg>`,
  seven:`<svg viewBox="0 0 100 100"><text x="50" y="90" text-anchor="middle" font-family="'Archivo Black',Arial,sans-serif" font-size="100" fill="#000">7</text></svg>`
};
const isMono=()=>Casino.theme==='74';
const symSVG = s => (isMono()?SVG_MONO:SVG)[s];
const PAY = {seven:300, bar3:100, bar2:50, bar1:20, bell:15, orange:12, lemon:10, cherry:10};

const C='cherry',L='lemon',O='orange',B='bell',B1='bar1',B2='bar2',B3='bar3',S='seven';
const STRIPS = [
  [S,C,B1,L,B,O,B2,L,C,B1,O,B3,L,C,B1,B,O,B2,C,B1,L,B],
  [C,L,B1,B,S,O,C,B2,B,B1,L,O,B3,B,L,B1,C,B2,O,B,B1,L],
  [L,B1,O,B,B2,L,S,B1,B,O,C,B3,B1,L,B,O,B2,L,B1,B,C,O]
];
const LINES = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]];
const BET_LINES = [1,3,5];
const COINS = [1,2,5,10,25,50,100,250,500,1000];
const MAX_CREDIT = 99999999;

/* ---------- audio ---------- */
let ac=null;
const audio = () => { if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(ac&&ac.state==='suspended') ac.resume(); return ac; };
function tone(f,t0,dur,type='square',vol=.06,slide){
  const a=audio(); if(!a||Casino.muted) return;
  const o=a.createOscillator(), g=a.createGain(), t=a.currentTime+t0;
  o.type=type; o.frequency.setValueAtTime(f,t); if(slide) o.frequency.exponentialRampToValueAtTime(slide,t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+.02);
}
function noise(t0,dur,vol=.15,freq=800){
  const a=audio(); if(!a||Casino.muted) return;
  const n=a.sampleRate*dur, buf=a.createBuffer(1,n,a.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const s=a.createBufferSource(), f=a.createBiquadFilter(), g=a.createGain(), t=a.currentTime+t0;
  f.type='lowpass'; f.frequency.value=freq; g.gain.value=vol; s.buffer=buf;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
const sfxMono = {
  tick(){ noise(0,.012,.12,3500); },
  stop(){ noise(0,.06,.35,350); tone(65,0,.12,'sine',.3); },
  start(){ for(let i=0;i<4;i++) noise(i*.03,.025,.12,2200); },
  lever(){ for(let i=0;i<6;i++) noise(i*.03,.02,.14,1800); },
  coin(){ noise(0,.015,.16,4000); tone(3000,0,.02,'sine',.02); },
  bet(){ noise(0,.02,.18,2500); },
  win(){ tone(1568,0,1.1,'sine',.12); tone(4328,0,.45,'sine',.03); },
  jackpot(){ for(let i=0;i<7;i++){ const f=i%2?1760:1568; tone(f,i*.16,.5,'sine',.1); tone(f*2.76,i*.16,.2,'sine',.025);} },
  buzz(){ noise(0,.2,.15,300); }
};
const sfxDeluxe = {
  tick(){ tone(1400,0,.012,'square',.018); },
  stop(){ noise(0,.07,.22,600); tone(90,0,.09,'sine',.25); },
  start(){ tone(220,0,.18,'square',.04,880); noise(0,.12,.08,2000); },
  lever(){ for(let i=0;i<5;i++) noise(i*.035,.03,.1,1500); },
  coin(){ tone(988,0,.05,'square',.04); tone(1319,.05,.08,'square',.04); },
  bet(){ tone(660,0,.05,'square',.04); },
  win(){ [523,659,784,1047].forEach((f,i)=>tone(f,i*.08,.12,'square',.05)); },
  jackpot(){ const m=[523,659,784,1047,784,1047,1319,1568]; m.forEach((f,i)=>{tone(f,i*.11,.16,'square',.05);tone(f/2,i*.11,.16,'triangle',.05);}); },
  buzz(){ tone(110,0,.25,'sawtooth',.05,90); }
};
const sfx = new Proxy({}, { get:(_,k)=>(isMono()?sfxMono:sfxDeluxe)[k] });

/* ---------- 7-segment LEDs: see core/led.js (window.CasinoLED) ---------- */
const makeLED = window.CasinoLED;
const ledCredit=makeLED(document.getElementById('ledCredit'),8);
const ledBet=makeLED(document.getElementById('ledBet'),4);
const ledWin=makeLED(document.getElementById('ledWin'),7);

/* ---------- state ---------- */
const store = {
  get(){ try{ const v=localStorage.getItem('lucky7-credits'); return v===null?null:+v; }catch(e){ return null; } },
  set(v){ Casino.setBank(v); try{ localStorage.setItem('lucky7-bet',JSON.stringify([betLevel,coinIdx])); }catch(e){} },
  bet(){ try{ return JSON.parse(localStorage.getItem('lucky7-bet')); }catch(e){ return null; } }
};
let credits = Casino.bank;
let betLevel=2, coinIdx=0, win=0, spinning=false, counting=false;
{ const b=store.bet(); if(Array.isArray(b)&&BET_LINES[b[0]]&&COINS[b[1]]){ betLevel=b[0]; coinIdx=b[1]; } }
const totalBet=()=>BET_LINES[betLevel]*COINS[coinIdx];
const fmt=n=>n.toLocaleString('en-US');
const msgEl=document.getElementById('msg');
const msg = t => { msgEl.textContent=t; };
const rnd = n => { const a=new Uint32Array(1); crypto.getRandomValues(a); return a[0]%n; };
const mod = (a,n) => ((a%n)+n)%n;

/* ---------- reels ---------- */
const reelsEl=document.getElementById('reels');
const tileHTML = (sym) => `<div class="tile" data-s="${sym}">${symSVG(sym)}</div>`;
let H=90;
class Reel{
  constructor(el,i){ this.el=el; this.strip=el.querySelector('.strip'); this.i=i; this.data=STRIPS[i]; this.pos=rnd(this.data.length);
    this.blur=document.querySelector('#mb'+i+' feGaussianBlur'); this.render(); }
  sym(k){ return this.data[mod(k,this.data.length)]; }
  render(){ this.strip.innerHTML=[-1,0,1].map(o=>tileHTML(this.sym(this.pos+o))).join(''); this.strip.style.transform='translateY(0)'; this.strip.style.filter=''; }
  tiles(){ return this.strip.querySelectorAll('.tile'); }
  spinTo(target,dur,loops){
    const len=this.data.length;
    const N=mod(this.pos-target,len)+len*loops; // symbols travel downward
    const html=[];
    for(let k=0;k<N+3;k++) html.push(tileHTML(this.sym(target-1+k)));
    this.strip.innerHTML=html.join('');
    this.strip.style.filter=`url(#mb${this.i})`;
    const dist=N*H, wind=90, settle=170, over=.2*H;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise(res=>{
      const t0=performance.now(); let lastD=0, lastT=t0, lastTile=0, lastTick=0;
      const frame=now=>{
        const t=now-t0; let d;
        if(t<wind) d=-.12*H*Math.sin(Math.PI/2*t/wind);
        else if(t<wind+dur){ const u=(t-wind)/dur, e=1-Math.pow(1-u,3.2); d=-.12*H+(dist+over+.12*H)*e; }
        else if(t<wind+dur+settle){ const u=(t-wind-dur)/settle; d=dist+over*(1-u)*(1-u)*(1+1.8*u)-over*0.0; d=dist+over*Math.cos(u*Math.PI/2)*(1-u*.2); }
        else d=dist;
        const v=Math.abs(d-lastD)/Math.max(1,now-lastT);
        if(!reduce) this.blur.setAttribute('stdDeviation',`0 ${Math.min(14,v*2.2).toFixed(2)}`);
        this.strip.style.transform=`translateY(${(-dist+d).toFixed(2)}px)`;
        const ti=Math.floor(d/H); if(ti!==lastTile && now-lastTick>45){ sfx.tick(); lastTick=now; } lastTile=ti;
        lastD=d; lastT=now;
        if(t<wind+dur+settle) requestAnimationFrame(frame);
        else { this.blur.setAttribute('stdDeviation','0 0'); this.pos=target; this.render(); sfx.stop(); res(); }
      };
      requestAnimationFrame(frame);
    });
  }
}
const reels=[...reelsEl.querySelectorAll('.reel')].map((el,i)=>new Reel(el,i));
const glassEl=document.querySelector('.glass'), cabEl=document.querySelector('.cabinet'), mobileMQ=matchMedia('(max-width:600px)');
function sizeTiles(){
  const w=reels[0].el.getBoundingClientRect().width;
  let h=Math.round(w*0.86);
  if(mobileMQ.matches){
    const cs=getComputedStyle(glassEl), avail=glassEl.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    h=Math.floor(Math.min(avail/3,w*1.45));
  }
  H=Math.max(40,h); document.documentElement.style.setProperty('--tile',H+'px');
  placeLever();
}
function placeLever(){
  const lv=document.getElementById('lever'); if(!lv) return;
  lv.style.top=Math.max(0,cabEl.offsetTop+glassEl.offsetTop+glassEl.offsetHeight/2-185)+'px';
}
sizeTiles(); addEventListener('resize',()=>{ if(!spinning) sizeTiles(); });
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ if(!spinning) sizeTiles(); });

/* ---------- pay table ---------- */
const mini = s => symSVG(s);
const payRows = [
  [[S,S,S],300],[[B3,B3,B3],100],[[B2,B2,B2],50],[[B1,B1,B1],20],
  [[B,B,B],15],[[O,O,O],12],[[L,L,L],10],[[C,C,C],10],
  ['any',5],[[C,C],4],[[C],1]
];
const renderPays=()=>document.getElementById('pays').innerHTML = payRows.map(([s,v])=> s==='any'
  ? `<div class="pay"><span class="ic">${mini(B1)}${mini(B2)}${mini(B3)}</span><span class="any">아무 BAR</span><b>${v}</b></div>`
  : `<div class="pay"><span class="ic">${s.map(mini).join('')}</span><b>${v}</b></div>`).join('');
renderPays();

function linePay(s){
  if(s[0]===s[1]&&s[1]===s[2]) return PAY[s[0]];
  if(s.every(x=>x.startsWith('bar'))) return 5;
  if(s[0]===C) return s[1]===C?4:1;
  return 0;
}

/* ---------- UI updates ---------- */
const NS='http://www.w3.org/2000/svg';
const LINE_COLORS=['#ff4a4a','#5ef2e6','#ffd400','#7cff6b','#ff6bd5'];
const linesSvg=document.getElementById('lines');
const lampEls=[...document.querySelectorAll('.lamp')];
let cycleTimer=null, previewTimer=null, uid=0;
const mk=(tag,attrs,parent)=>{ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; };
const cellOf=(col,row)=>{ const el=reels[col].el; return {x:el.offsetLeft,y:row*H,w:el.offsetWidth,h:H}; };
function linePoints(li,upto){
  const W=reelsEl.clientWidth;
  const c=[0,1,2].map(k=>{ const r=cellOf(k,LINES[li][k]); return [r.x+r.w/2,r.y+r.h/2]; });
  const dx=c[1][0]-c[0][0], dy=c[1][1]-c[0][1];
  const start=[0,c[0][1]-dy*(c[0][0]/dx)];
  const end=[W,c[2][1]+dy*((W-c[2][0])/dx)];
  return upto>=3?[start,...c,end]:[start,...c.slice(0,upto)];
}
function tube(parent,tag,attrs,color){
  if(isMono()){ mk(tag,{...attrs,stroke:'#000','stroke-width':3,pathLength:1,class:'draw'},parent); return; }
  mk(tag,{...attrs,stroke:'rgba(0,0,0,.6)','stroke-width':11,pathLength:1,class:'draw'},parent);
  mk(tag,{...attrs,stroke:color,'stroke-width':6,pathLength:1,class:'glow',filter:'url(#neon)'},parent);
  mk(tag,{...attrs,stroke:'#fff','stroke-width':2,'stroke-opacity':.9,pathLength:1,class:'draw'},parent);
}
function clearOverlay(){ linesSvg.innerHTML=''; linesSvg.classList.remove('fade'); }
function sizeOverlay(){ linesSvg.setAttribute('viewBox',`0 0 ${reelsEl.clientWidth} ${reelsEl.clientHeight}`); }
function drawWin(li,n){
  clearOverlay(); sizeOverlay();
  const color=LINE_COLORS[li], id='m'+(++uid), pad=5;
  const cells=[]; for(let k=0;k<n;k++) cells.push(cellOf(k,LINES[li][k]));
  const W=reelsEl.clientWidth, Hh=reelsEl.clientHeight;
  const defs=mk('defs',{},linesSvg), mask=mk('mask',{id,maskUnits:'userSpaceOnUse',x:0,y:0,width:W,height:Hh},defs);
  mk('rect',{x:0,y:0,width:W,height:Hh,fill:'#fff'},mask);
  cells.forEach(c=>mk('rect',{x:c.x+pad,y:c.y+pad,width:c.w-pad*2,height:c.h-pad*2,rx:12,fill:'#000'},mask));
  const pts=linePoints(li,n).map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ');
  tube(mk('g',{mask:`url(#${id})`},linesSvg),'polyline',{points:pts},color);
  const boxes=mk('g',{},linesSvg);
  if(isMono()) cells.forEach(c=>mk('rect',{x:c.x+7,y:c.y+7,width:c.w-14,height:c.h-14,rx:3,class:'ants'},boxes));
  if(!isMono()) cells.forEach(c=>tube(boxes,'rect',{x:c.x+pad,y:c.y+pad,width:c.w-pad*2,height:c.h-pad*2,rx:12},color));
  const y0=linePoints(li,3)[0][1], by=Math.min(Hh-13,Math.max(13,y0));
  const b=mk('g',{class:'badge',style:`transform-origin:14px ${by}px`},linesSvg);
  if(isMono()) mk('circle',{cx:14,cy:by,r:11,fill:'#fff',stroke:'#000','stroke-width':2.5},b);
  else mk('circle',{cx:14,cy:by,r:12,fill:color,stroke:'#000','stroke-width':2.5,filter:'url(#neon)'},b);
  const t=mk('text',{x:14,y:by+5,'text-anchor':'middle','font-family':isMono()?'Space Mono,monospace':'Bungee,Impact,sans-serif','font-weight':700,'font-size':14,fill:isMono()?'#000':'#140a00'},b);
  t.textContent=li+1;
  reels.forEach(r=>r.tiles().forEach(tl=>tl.classList.remove('hit')));
  for(let k=0;k<n;k++) reels[k].tiles()[LINES[li][k]].classList.add('hit');
}
function showWins(hits){
  let i=0;
  const step=()=>{ const h=hits[i%hits.length]; drawWin(h.li,h.n); i++; };
  step();
  if(hits.length>1) cycleTimer=setInterval(step,1300);
}
function previewLines(){
  clearTimeout(previewTimer); clearOverlay(); sizeOverlay();
  for(let li=0;li<BET_LINES[betLevel];li++){
    const pts=linePoints(li,3).map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ');
    if(isMono()) mk('polyline',{points:pts,stroke:'#000','stroke-width':2,class:'preview'},linesSvg);
    else mk('polyline',{points:pts,stroke:LINE_COLORS[li],'stroke-width':3,class:'preview',filter:'url(#neon)'},linesSvg);
  }
  previewTimer=setTimeout(()=>{ linesSvg.classList.add('fade'); previewTimer=setTimeout(clearOverlay,450); },1100);
}
function refresh(){
  ledCredit(credits); ledBet(totalBet()); ledWin(win);
  document.getElementById('subLines').textContent=BET_LINES[betLevel]+'줄';
  document.getElementById('subBet').textContent='×'+fmt(COINS[coinIdx]);
  const n=BET_LINES[betLevel];
  lampEls.forEach(l=>l.classList.toggle('on',+l.dataset.l<n));
  const busy=spinning||counting;
  ['btnLines','btnBet','btnMax','btnSpin'].forEach(id=>document.getElementById(id).disabled=busy);
  document.getElementById('btnRefill').classList.toggle('glow',credits<BET_LINES[0]&&!busy);
  store.set(credits);
}
function clearWins(){ clearInterval(cycleTimer); clearTimeout(previewTimer); clearOverlay(); document.querySelectorAll('.tile.hit').forEach(t=>t.classList.remove('hit')); document.body.classList.remove('jackpot'); }

/* ---------- bulbs ---------- */
const bulbs=[];
['bulbsTop','bulbsBot'].forEach(id=>{ const el=document.getElementById(id); for(let i=0;i<14;i++){ const b=document.createElement('i'); b.className='bulb'; el.appendChild(b); bulbs.push(b);} });
let bulbMode='idle', bt=0;
setInterval(()=>{
  bt++;
  bulbs.forEach((b,i)=>{
    let on;
    if(bulbMode==='win') on=(i+bt)%2===0;
    else if(bulbMode==='spin') on=(i+bt)%4===0;
    else on=(i+Math.floor(bt/2))%3===0;
    b.classList.toggle('on',on);
  });
},110);

/* ---------- game flow ---------- */
async function spin(){
  if(spinning||counting) return;
  audio();
  const cost=totalBet(), nLines=BET_LINES[betLevel], coin=COINS[coinIdx];
  if(credits<cost){ msg(credits>0?'LOWER YOUR BET':'INSERT COIN'); sfx.buzz(); refresh(); return; }
  spinning=true; credits-=cost; win=0; clearWins(); refresh();
  msg('GOOD LUCK!'); bulbMode='spin'; sfx.start();
  const targets=reels.map(r=>rnd(r.data.length));
  await Promise.all(reels.map((r,i)=>r.spinTo(targets[i],950+i*430,2+i)));
  spinning=false; bulbMode='idle';
  // evaluate
  const grid=[0,1,2].map(row=>reels.map(r=>r.sym(r.pos+row-1)));
  let total=0; const hits=[];
  for(let li=0; li<nLines; li++){
    const s=LINES[li].map((row,col)=>grid[row][col]);
    const p=linePay(s);
    if(p){ total+=p*coin;
      const n = (s[0]===s[1]&&s[1]===s[2])||s.every(x=>x.startsWith('bar')) ? 3 : (s[0]===C&&s[1]===C?2:1);
      hits.push({li,n});
    }
  }
  if(hits.length) showWins(hits);
  if(!total){ msg(credits<BET_LINES[0]?'INSERT COIN':'TRY AGAIN'); refresh(); return; }
  const mult=total/coin, big=mult>=50;
  msg(big?`JACKPOT!!! ${fmt(total)}`:`WINNER ${fmt(total)}`);
  if(big){ bulbMode='win'; document.body.classList.add('jackpot'); sfx.jackpot(); coinRain(Math.min(70,12+mult/5|0)); } else { sfx.win(); bulbMode='win'; }
  await countUp(total);
  bulbMode='idle'; refresh();
}
function countUp(total){
  counting=true; refresh();
  const steps=Math.min(total/COINS[coinIdx]|0||1,60), step=Math.ceil(total/Math.max(steps,Math.min(total,8)));
  return new Promise(res=>{
    let paid=0;
    const tick=()=>{
      const add=Math.min(step,total-paid); paid+=add; win+=add; credits=Math.min(MAX_CREDIT,credits+add); sfx.coin();
      ledWin(win); ledCredit(credits);
      if(paid<total) setTimeout(tick,step>1?45:85);
      else { counting=false; res(); }
    };
    setTimeout(tick,350);
  });
}
function coinRain(n){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for(let i=0;i<n;i++){
    const c=document.createElement('div'); c.className='coin';
    c.style.left=Math.random()*100+'vw'; c.style.animationDuration=(1.4+Math.random()*1.6)+'s'; c.style.animationDelay=(Math.random()*1.2)+'s';
    document.body.appendChild(c); setTimeout(()=>c.remove(),4500);
  }
}
const betMsg=()=>msg(`${BET_LINES[betLevel]}L × ${fmt(COINS[coinIdx])} = ${fmt(totalBet())}`);
function changeLines(){ if(spinning||counting) return; audio(); betLevel=(betLevel+1)%3; sfx.bet(); clearWins(); previewLines(); betMsg(); refresh(); }
function changeBet(dir=1){ if(spinning||counting) return; audio(); coinIdx=(coinIdx+dir+COINS.length)%COINS.length; sfx.bet(); clearWins(); betMsg(); refresh(); }
function maxBet(){ if(spinning||counting) return; betLevel=2;
  let i=COINS.length-1; while(i>0&&COINS[i]*5>credits) i--; coinIdx=i; sfx.bet(); refresh(); spin(); }

document.getElementById('btnLines').onclick=changeLines;
document.getElementById('btnBet').onclick=()=>changeBet(1);
document.getElementById('btnMax').onclick=maxBet;
document.getElementById('btnSpin').onclick=spin;
document.getElementById('btnRefill').onclick=()=>{ if(spinning||counting) return; audio(); credits=Math.min(MAX_CREDIT,credits+1000); sfx.coin(); msg('CREDITS +1,000'); refresh(); };
const togglePays=()=>document.body.classList.toggle('sheet');
document.getElementById('btnPays').onclick=togglePays;
document.getElementById('scrim').onclick=togglePays;
document.querySelector('.belly').addEventListener('click',()=>{ if(document.body.classList.contains('sheet')) togglePays(); });
const tagEl=document.getElementById('tagline'), themeBtn=document.getElementById('btnTheme');
function applyTheme(){
  document.body.classList.toggle('mono',isMono());
  tagEl.innerHTML=isMono()?'<span>model ls-74</span><span>3 reel · 5 line</span>':'Super Deluxe ’86';
  themeBtn.textContent=isMono()?'’86':'’74';
  if(!spinning){ clearWins(); reels.forEach(r=>r.render()); }
  renderPays(); requestAnimationFrame(sizeTiles);
}
themeBtn.onclick=()=>{ if(spinning||counting) return; Casino.setTheme(isMono()?'86':'74'); sfx.bet(); };
Casino.onTheme(applyTheme);
applyTheme();
const sb=document.getElementById('btnSound');
const syncSound=()=>{ sb.textContent=Casino.muted?'소리 끔':'소리 켬'; };
sb.onclick=()=>Casino.setMuted(!Casino.muted);
Casino.onSound(syncSound); syncSound();
document.getElementById('slotBack').onclick=()=>Casino.go('lobby');
Casino.register('slot',{
  title:()=>isMono()?'lucky 7 — model ls-74':'LUCKY 7 — Super Deluxe ’86',
  enter(){ credits=Casino.bank; win=0; clearWins(); document.body.classList.remove('sheet'); refresh(); requestAnimationFrame(sizeTiles); msg(credits<BET_LINES[0]?'INSERT COIN':'PULL THE LEVER'); },
  canLeave:()=>!spinning&&!counting
});

addEventListener('keydown',e=>{
  if(Casino.view!=='slot') return;
  if(e.target.closest('button')&&(e.code==='Space'||e.code==='Enter')) return;
  if(e.code==='Space'){ e.preventDefault(); pullAnim(); }
  else if(e.key==='l'||e.key==='L') changeLines();
  else if(e.key==='b'||e.key==='B'||e.key==='ArrowUp') changeBet(1);
  else if(e.key==='v'||e.key==='V'||e.key==='ArrowDown') changeBet(-1);
  else if(e.key==='m'||e.key==='M') maxBet();
});

/* ---------- lever ---------- */
const lever=document.getElementById('lever'), rod=document.getElementById('rod'), ball=document.getElementById('ball');
const TOP=4, BOTTOM=150, BASE=185;
function setPull(p){
  const y=TOP+(BOTTOM-TOP)*p;
  ball.style.top=y+'px';
  rod.style.top=(y+17)+'px'; rod.style.height=Math.max(0,BASE-(y+17))+'px';
}
setPull(0);
function springBack(from){
  const t0=performance.now();
  const f=now=>{ const u=Math.min(1,(now-t0)/380); const p=from*(1-u)*Math.cos(u*Math.PI*1.5)*(1-u*0.3); setPull(Math.max(-.08,p)); if(u<1) requestAnimationFrame(f); else setPull(0); };
  requestAnimationFrame(f);
}
function pullAnim(){
  if(spinning||counting) return;
  sfx.lever();
  const t0=performance.now();
  const f=now=>{ const u=Math.min(1,(now-t0)/160); setPull(u*u); if(u<1) requestAnimationFrame(f); else { spin(); springBack(1); } };
  requestAnimationFrame(f);
}
let drag=null;
lever.addEventListener('pointerdown',e=>{ if(spinning||counting) return; audio(); drag={y:e.clientY,p:0}; lever.setPointerCapture(e.pointerId); lever.style.cursor='grabbing'; });
lever.addEventListener('pointermove',e=>{ if(!drag) return; drag.p=Math.max(0,Math.min(1,(e.clientY-drag.y)/(BOTTOM-TOP))); setPull(drag.p); });
const release=()=>{ if(!drag) return; const p=drag.p; drag=null; lever.style.cursor='';
  if(p>.65){ sfx.lever(); setPull(1); spin(); springBack(1); }
  else if(p<.05){ pullAnim(); }
  else springBack(p); };
lever.addEventListener('pointerup',release); lever.addEventListener('pointercancel',release);
lever.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); pullAnim(); } });

refresh();
if(credits<BET_LINES[0]) msg('INSERT COIN');
})();
