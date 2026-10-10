/* 7-segment LED counter (deluxe theme) with a rolling drum counter for the '74 mono theme.
 * makeLED(el, digits, { zero, noRoll }) returns set(value). Shared by every game as window.CasinoLED. */
const SEGS = {a:"6,1 18,1 20,3 18,5 6,5 4,3", b:"21,4 23,6 23,17 21,19 19,17 19,6", c:"21,21 23,23 23,34 21,36 19,34 19,23",
  d:"6,35 18,35 20,37 18,39 6,39 4,37", e:"3,21 5,23 5,34 3,36 1,34 1,23", f:"3,4 5,6 5,17 3,19 1,17 1,6", g:"6,18 18,18 20,20 18,22 6,22 4,20"};
const DIG = ['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
export function makeLED(el,n,opt){
  const o=typeof opt==='object'&&opt?opt:{noRoll:!!opt}, noRoll=o.noRoll;
  el.innerHTML=''; el.style.setProperty('--n',n);
  const digits=[];
  for(let i=0;i<n;i++){
    const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('viewBox','0 0 26 40');
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform','skewX(-6) translate(3 0)');
    const m={};
    for(const k in SEGS){ const p=document.createElementNS('http://www.w3.org/2000/svg','polygon'); p.setAttribute('points',SEGS[k]); g.appendChild(p); m[k]=p; }
    s.appendChild(g); el.appendChild(s); digits.push(m);
  }
  const drum=document.createElement('div'); drum.className='drum'; drum.style.setProperty('--n',n);
  const cells=[]; for(let i=0;i<n;i++){ const c=document.createElement('i'), b=document.createElement('b'); b.textContent='0'; c.appendChild(b); drum.appendChild(c); cells.push(b); }
  el.parentNode.appendChild(drum);
  return v => {
    const str=String(Math.max(0,Math.floor(v))).slice(-n).padStart(n,o.zero?'0':' ');
    digits.forEach((m,i)=>{ const ch=str[i]; const on=ch===' '?'':DIG[+ch]; for(const k in m) m[k].classList.toggle('on',on.includes(k)); });
    const z=String(Math.max(0,Math.floor(v))).slice(-n).padStart(n,'0');
    cells.forEach((b,i)=>{ if(b.textContent!==z[i]){ b.textContent=z[i]; if(window.Casino.theme==='74'&&!noRoll){ b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll'); } } });
  };
}

window.CasinoLED = makeLED;
