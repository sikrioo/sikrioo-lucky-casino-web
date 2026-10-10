/* LUCKY CLAW — SVG art for the side panels and the gacha opener (pure functions of their arguments). */
import { SIZES, BOXC, BASE_ARM } from './config.js';

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function boxSVG(k, m, idp) {
  const S = SIZES[k], c = BOXC[k], x = (76 - S.w) / 2, y = 64 - S.h - 1, w = S.w, h = S.h, bw = Math.max(4, w * .16), cx = 38;
  const id = `${idp}${k}`;
  let fill, rib, ribStroke = '', extra = '', defs = '';
  if (m) {
    fill = k === 'XL' ? '#000' : k === 'L' ? `url(#${id}d)` : '#fff';
    rib = k === 'M' ? '#000' : '#fff';
    if (k === 'L') { defs = `<pattern id="${id}d" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#000"/></pattern>`; ribStroke = ' stroke="#000" stroke-width="1.2"'; }
  } else {
    defs = `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`;
    fill = `url(#${id}g)`; rib = c[2];
  }
  const body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`;
  const ribbons = (m && k === 'S') ? `<rect x="${cx - 2}" y="${y}" width="4" height="${h}" fill="#000"/>`
    : `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" fill="${rib}"${ribStroke}/><rect x="${x}" y="${y + h / 2 - bw / 2}" width="${w}" height="${bw}" fill="${rib}"${ribStroke}/>`;
  const outline = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${m ? '#000' : 'rgba(0,0,0,.45)'}" stroke-width="${m ? 2.2 : 1.5}"/>`;
  const s = Math.max(5, w * .14), bf = m ? '#fff' : rib, bs = m ? '#000' : 'rgba(0,0,0,.4)';
  const bowM = `<g fill="${bf}" stroke="${bs}" stroke-width="1.2"><ellipse cx="${cx - s * .6}" cy="${y - s * .32}" rx="${s * .62}" ry="${s * .36}" transform="rotate(28 ${cx - s * .6} ${y - s * .32})"/><ellipse cx="${cx + s * .6}" cy="${y - s * .32}" rx="${s * .62}" ry="${s * .36}" transform="rotate(-28 ${cx + s * .6} ${y - s * .32})"/><circle cx="${cx}" cy="${y - s * .18}" r="${s * .28}"/></g>`;
  return `<svg viewBox="0 0 76 64" aria-hidden="true"><defs>${defs}</defs>${body}${ribbons}${outline}${bowM}${extra}</svg>`;
}
export function shapeIcon(d, m) {
  if (d.shape === 'box') return boxSVG(d.k, m, 'pt');
  const c = BOXC[d.k], dark = m && (d.k === 'M' || d.k === 'L');
  const st = m ? 'stroke="#000" stroke-width="2.2"' : 'stroke="rgba(0,0,0,.45)" stroke-width="1.5"';
  let body = '';
  if (d.shape === 'ball') {
    const r = d.r * .95, cy = 63 - r;
    body = `<path d="M${38 - r} ${cy} A${r} ${r} 0 0 1 ${38 + r} ${cy} Z" fill="${m ? (d.k === 'M' ? '#000' : '#fff') : c[1]}"/>
      <path d="M${38 - r} ${cy} A${r} ${r} 0 0 0 ${38 + r} ${cy} Z" fill="${m ? '#fff' : '#dfe5ec'}"/>
      <rect x="${38 - r}" y="${cy - 1.5}" width="${2 * r}" height="3" fill="${m ? '#000' : 'rgba(0,0,0,.35)'}"/>
      <circle cx="38" cy="${cy}" r="${r}" fill="none" ${st}/>`;
  } else if (d.shape === 'can') {
    const w = d.w * .8, h = d.h * .8, x = 38 - w / 2, y = 63 - h;
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${m ? '#fff' : c[1]}"/>
      <rect x="${x}" y="${y + h * .32}" width="${w}" height="${h * .36}" fill="${m ? (d.k === 'L' ? '#000' : '#fff') : c[2]}" ${m ? 'stroke="#000" stroke-width="1.2"' : ''}/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" ${st}/>`;
  } else {
    const r = d.r * .9, cx = 38, cy = 63 - r * .87;
    const pts = a => Array.from({ length: 6 }, (_, i) => { const t = i * Math.PI / 3; return `${cx + Math.cos(t) * r * a},${cy + Math.sin(t) * r * a}`; }).join(' ');
    body = `<polygon points="${pts(1)}" fill="${m ? (dark ? '#000' : '#fff') : c[1]}" ${st}/><polygon points="${pts(.55)}" fill="${m ? (dark ? '#fff' : '#000') : c[0]}"/>`;
  }
  return `<svg viewBox="0 0 76 64" aria-hidden="true">${body}</svg>`;
}

export function gachaSVG(k, m, shape = 'box') {
  if (shape !== 'box') return gachaShapeSVG(k, m, shape);
  const sc = { S: .72, M: .82, L: .92, XL: 1 }[k], c = BOXC[k];
  let bodyFill, lidFill, rib, ribStroke = '', defs = '', crack = '#fff8c0';
  if (m) {
    bodyFill = lidFill = k === 'XL' ? '#000' : k === 'L' ? 'url(#gdots)' : '#fff';
    rib = k === 'M' ? '#000' : '#fff';
    crack = k === 'XL' ? '#fff' : '#000';
    defs = `<pattern id="gdots" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#fff"/><circle cx="4.5" cy="4.5" r="1.6" fill="#000"/></pattern>`;
    if (k === 'L' || k === 'S') ribStroke = ' stroke="#000" stroke-width="3"';
  } else {
    defs = `<linearGradient id="gbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>
            <linearGradient id="glg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".4" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`;
    bodyFill = 'url(#gbg)'; lidFill = 'url(#glg)'; rib = c[2];
  }
  const ol = m ? 'stroke="#000" stroke-width="4"' : 'stroke="rgba(0,0,0,.45)" stroke-width="2.5"';
  const ribW = (m && k === 'S') ? 10 : 24;
  const cracks = [
    'M100 92 L92 110 L104 124 L95 142 L102 160',
    'M58 100 L72 114 L63 130 L74 146',
    'M142 96 L128 112 L139 128 L129 146',
    'M48 150 L64 160 L55 178',
    'M152 150 L137 163 L147 180',
    'M30 80 L60 74 L100 80 L140 72 L170 80'
  ].map((d, i) => `<path class="crack c${i}" d="${d}" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="--cc:${crack}"/>`).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><defs>${defs}</defs>
    <g transform="translate(100 188) scale(${sc}) translate(-100 -188)">
      <ellipse cx="100" cy="190" rx="70" ry="7" fill="${m ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.4)'}"/>
      <g class="body">
        <rect x="34" y="84" width="132" height="102" rx="8" fill="${bodyFill}" ${ol}/>
        <rect x="${100 - ribW / 2}" y="84" width="${ribW}" height="102" fill="${rib}"${ribStroke}/>
        ${m ? '' : '<rect x="42" y="92" width="40" height="5" rx="2" fill="#fff" opacity=".35"/>'}
      </g>
      <g class="lid">
        <rect x="26" y="62" width="148" height="28" rx="6" fill="${lidFill}" ${ol}/>
        <rect x="${100 - ribW / 2}" y="62" width="${ribW}" height="28" fill="${rib}"${ribStroke}/>
        <g fill="${m ? '#fff' : rib}" stroke="${m ? '#000' : 'rgba(0,0,0,.4)'}" stroke-width="${m ? 3.5 : 2.5}">
          <ellipse cx="80" cy="50" rx="22" ry="12" transform="rotate(22 80 50)"/>
          <ellipse cx="120" cy="50" rx="22" ry="12" transform="rotate(-22 120 50)"/>
          <circle cx="100" cy="56" r="9"/>
        </g>
      </g>
      ${cracks}
    </g></svg>`;
}
export function gachaShapeSVG(k, m, shape) {
  const sc = { S: .72, M: .82, L: .92, XL: 1 }[k], c = BOXC[k];
  const dark = m && (k === 'M' || k === 'L');
  const ol = m ? 'stroke="#000" stroke-width="4"' : 'stroke="rgba(0,0,0,.45)" stroke-width="2.5"';
  const crack = m ? (dark && shape !== 'ball' ? '#fff' : '#000') : '#fff8c0';
  const defs = m ? '' : `<linearGradient id="gsc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>
    <linearGradient id="gsh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c[1]}"/><stop offset=".35" stop-color="${c[0]}"/><stop offset=".5" stop-color="#fff"/><stop offset=".65" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`;
  let body = '', lid = '', cracks = [];
  if (shape === 'ball') {
    lid = `<path d="M30 120 A70 70 0 0 1 170 120 Z" fill="${m ? (k === 'M' ? '#000' : '#fff') : 'url(#gsc)'}" ${ol}/>
      ${m ? '' : '<ellipse cx="72" cy="82" rx="18" ry="9" fill="#fff" opacity=".55" transform="rotate(-30 72 82)"/>'}`;
    body = `<path d="M30 120 A70 70 0 0 0 170 120 Z" fill="${m ? '#fff' : 'rgba(225,232,240,.95)'}" ${ol}/>
      <rect x="28" y="115" width="144" height="10" rx="4" fill="${m ? '#000' : 'rgba(0,0,0,.3)'}"/>`;
    cracks = ['M100 60 L92 80 L104 94 L96 112', 'M60 82 L74 96 L66 110', 'M140 78 L128 94 L139 108', 'M58 140 L74 150 L66 168', 'M142 140 L128 152 L138 170', 'M32 120 L66 116 L100 122 L134 115 L168 120'];
  } else if (shape === 'can') {
    body = `<rect x="52" y="70" width="96" height="116" rx="12" fill="${m ? '#fff' : 'url(#gsh)'}" ${ol}/>
      <rect x="52" y="106" width="96" height="44" fill="${m ? (dark ? '#000' : '#fff') : c[2]}" ${m ? 'stroke="#000" stroke-width="3"' : ''}/>
      ${m ? '' : `<text x="100" y="138" text-anchor="middle" font-size="30" font-weight="700" fill="${c[1]}">★</text>`}`;
    lid = `<ellipse cx="100" cy="70" rx="48" ry="15" fill="${m ? '#fff' : '#dfe5ec'}" ${ol}/>
      <ellipse cx="100" cy="70" rx="34" ry="9" fill="none" stroke="${m ? '#000' : '#8a94a1'}" stroke-width="3"/>
      <rect x="88" y="54" width="24" height="12" rx="6" fill="none" stroke="${m ? '#000' : '#7d8794'}" stroke-width="4"/>`;
    cracks = ['M100 112 L92 128 L104 140 L96 156', 'M64 96 L78 108 L70 124', 'M136 92 L124 108 L134 122', 'M62 156 L76 166 L68 180', 'M138 156 L124 168 L134 182', 'M54 84 L80 80 L100 86 L124 79 L146 84'];
  } else {
    body = `<polygon points="46,94 154,94 172,125 136,187 64,187 28,125" fill="${m ? (dark ? '#000' : '#fff') : 'url(#gsc)'}" ${ol}/>
      <polygon points="72,110 128,110 142,135 118,170 82,170 58,135" fill="${m ? (dark ? '#fff' : '#000') : 'rgba(255,255,255,.35)'}"/>`;
    lid = `<polygon points="64,63 136,63 154,94 46,94" fill="${m ? (dark ? '#000' : '#fff') : c[0]}" ${ol}/>
      <polyline points="82,63 72,94 M118,63 128,94" fill="none" stroke="${m ? (dark ? '#fff' : '#000') : 'rgba(255,255,255,.5)'}" stroke-width="3"/>`;
    cracks = ['M100 110 L92 126 L104 140 L96 158', 'M62 112 L76 124 L68 140', 'M138 110 L126 124 L136 140', 'M52 140 L68 150 L60 168', 'M148 140 L134 152 L144 170', 'M48 92 L76 88 L100 95 L124 88 L152 92'];
  }
  const cr = cracks.map((d, i) => `<path class="crack c${i}" d="${d}" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="--cc:${crack}"/>`).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><defs>${defs}</defs>
    <g transform="translate(100 188) scale(${sc}) translate(-100 -188)">
      <ellipse class="gshadow" cx="100" cy="190" rx="70" ry="7" fill="${m ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.4)'}"/>
      <g class="body">${body}</g><g class="lid">${lid}</g>${cr}
    </g></svg>`;
}
export function gemSVG(r) {
  const rays = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = 58, r2 = 72; return `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${50 + Math.sin(a) * r2}"/>`; }).join('');
  return `<svg class="gem r${r}" viewBox="0 0 100 100" aria-hidden="true"><g class="rays">${rays}</g>
    <polygon class="g-o" points="50,8 88,36 50,94 12,36"/><polygon class="g-t" points="30,36 50,8 70,36"/>
    <polyline class="g-l" points="12,36 88,36"/><polyline class="g-l" points="30,36 50,94 70,36"/></svg>`;
}

export function clawIcon(f, m) {                        // a little claw, drawn at the size's scale
  const ink = m ? 'currentColor' : '#f4f7fa', edge = m ? 'none' : '#2a2f36', cx = 26, y0 = 6;
  const arm = sd => BASE_ARM.map(([x, y]) => { const [rx, ry] = rot(x * f, y * f, -.22); return `${(cx + sd * (13 * f + rx)).toFixed(1)},${(y0 + 4 * f + ry).toFixed(1)}`; }).join(' ');
  const head = `<rect x="${cx - 13 * f}" y="${y0}" width="${26 * f}" height="${15 * f}" rx="${4 * f}" fill="${m ? 'currentColor' : '#c9d1db'}"/>`;
  const arms = [-1, 1].map(sd => (edge !== 'none' ? `<polyline points="${arm(sd)}" fill="none" stroke="${edge}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
    `<polyline points="${arm(sd)}" fill="none" stroke="${ink}" stroke-width="${m ? 3.5 : 2.6}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 52 44" aria-hidden="true"><line x1="${cx}" y1="0" x2="${cx}" y2="${y0}" stroke="${m ? 'currentColor' : '#9aa4b1'}" stroke-width="1.6"/>${arms}${head}</svg>`;
}
