/* ToneLab: tunings, guitar drawing, pitch detection */
const $=s=>document.querySelector(s),t=s=>s.split(' ');
const INSTRUMENTS = {
  guitar6: { label: 'Guitar 6', tunings: {
    'Standard (E A D G B E)': t('E2 A2 D3 G3 B3 E4'),
    'Half step down (Eb)': t('D#2 G#2 C#3 F#3 A#3 D#4'),
    'Full step down (D)': t('D2 G2 C3 F3 A3 D4'),
    'Drop D': t('D2 A2 D3 G3 B3 E4'),
    'Double drop D': t('D2 A2 D3 G3 B3 D4'),
    'Drop C': t('C2 G2 C3 F3 A3 D4'),
    'Drop B': t('B1 F#2 B2 E3 G#3 C#4'),
    'Baritone (B standard)': t('B1 E2 A2 D3 F#3 B3'),
    'DADGAD': t('D2 A2 D3 G3 A3 D4'),
    'Open D': t('D2 A2 D3 F#3 A3 D4'),
    'Open Dm': t('D2 A2 D3 F3 A3 D4'),
    'Open G': t('D2 G2 D3 G3 B3 D4'),
    'Open E': t('E2 B2 E3 G#3 B3 E4'),
    'Open A': t('E2 A2 E3 A3 C#4 E4'),
    'Open C': t('C2 G2 C3 G3 C4 E4'),
    'New Standard (C G D A E G)': t('C2 G2 D3 A3 E4 G4')
  }},
  bass4: { label: 'Bass 4', tunings: {
    'Standard (E A D G)': t('E1 A1 D2 G2'),
    'Half step down (Eb)': t('D#1 G#1 C#2 F#2'),
    'D standard': t('D1 G1 C2 F2'),
    'Drop D': t('D1 A1 D2 G2'),
    'Drop C': t('C1 G1 C2 F2'),
    'Tenor (octave up)': t('E2 A2 D3 G3')
  }},
  bass5: { label: 'Bass 5', tunings: {
    'Standard (B E A D G)': t('B0 E1 A1 D2 G2'),
    'High C (E A D G C)': t('E1 A1 D2 G2 C3'),
    'Drop A': t('A0 E1 A1 D2 G2')
  }}
};
function yin(x, sr, fmin, fmax) {
  const tmax = Math.min(Math.floor(sr / fmin), x.length / 2 - 1), tmin = Math.max(2, Math.floor(sr / fmax));
  const W = x.length - tmax - 1, c = new Float32Array(tmax + 1);
  let run = 0; c[0] = 1;
  for (let tau = 1; tau <= tmax; tau++) {
    let s = 0; for (let i = 0; i < W; i++) { const d = x[i] - x[i + tau]; s += d * d; }
    run += s; c[tau] = s * tau / run;
  }
  let tau = tmin;
  while (tau < tmax && c[tau] >= 0.12) tau++;
  if (tau >= tmax) return -1;
  while (tau + 1 < tmax && c[tau + 1] < c[tau]) tau++;
  const a = c[tau - 1], b = c[tau], g = c[tau + 1], den = a - 2 * b + g;
  return sr / (tau + (den ? (a - g) / (2 * den) : 0));
}
let actx;
function playTone(f) {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  const o = actx.createOscillator(), g = actx.createGain(), now = actx.currentTime;
  o.type = 'triangle'; o.frequency.value = f;
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.35, now + .03); g.gain.exponentialRampToValueAtTime(.001, now + 2.2);
  o.connect(g).connect(actx.destination); o.start(now); o.stop(now + 2.3);
}

const S={inst:'guitar6',tuning:null,a4:440,mode:'auto',lock:-1,sel:0,running:false,pos:0,target:0,hist:[],lastHit:0};
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11},NAMES='C C# D D# E F F# G G# A A# B'.split(' ');
const TITLES={guitar6:'Six-string guitar',guitar7:'Seven-string guitar',bass4:'Four-string bass',bass5:'Five-string bass'};
const midi=n=>{const m=n.match(/^([A-G])(#?)(\d)$/);return(+m[3]+1)*12+NOTE[m[1]]+(m[2]?1:0)};
const freq=n=>S.a4*Math.pow(2,(midi(n)-69)/12);
const strs=()=>INSTRUMENTS[S.inst].tunings[S.tuning];
const nm=n=>n.replace(/\d/,''),oc=n=>n.match(/\d/)[0];
const sw=(i,n)=>(3.4-2.4*i/(n-1)).toFixed(1);

/* controls */
function drawControls(){
  $('#inst').innerHTML=Object.entries(INSTRUMENTS).map(([k,v])=>`<button type="button" data-k="${k}" aria-pressed="${k===S.inst}">${v.label}</button>`).join('');
  $('#inst').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.inst=b.dataset.k;S.tuning=Object.keys(INSTRUMENTS[S.inst].tunings)[0];rebuild(true)});
  $('#tuning').innerHTML=Object.keys(INSTRUMENTS[S.inst].tunings).map(k=>`<option>${k}</option>`).join('');
  $('#tuning').value=S.tuning;
}
$('#tuning').onchange=e=>{S.tuning=e.target.value;rebuild(false)};
function setMode(m){
  S.mode=m;S.lock=-1;S.sel=m==='chrom'?-1:0;
  document.querySelectorAll('#mode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));
  $('#ptitle').textContent=m==='chrom'?'Chromatic tuner':'String tuner';idle();
}
document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
const setA4=v=>{S.a4=Math.min(450,Math.max(430,v));$('#a4').textContent=S.a4};
$('#a4m').onclick=()=>setA4(S.a4-1);$('#a4p').onclick=()=>setA4(S.a4+1);

/* real photos with glowing string overlays (all coordinates are photo pixels) */
const PH={
  guitar6:{src:'img/guitar-6.png',box:[0,0,1234,385],sw:3,r:11,fs:19,lab:[0,-20],
    knob:i=>[[1061,135],[1089,145],[1116,154],[1142,161],[1171,171],[1197,179]][i],
    str:i=>{const a=[152,163,174,185,197,209][i],b=[168,178,187,196,207,219][i],y=x=>a+(x-450)*(b-a)/450;
      return[[[1049,164],[1077,174],[1104,183],[1132,191],[1160,199],[1188,208]][i],[1013,y(1013)],[196,y(196)]]}},
  bass4:{src:'img/bass-4.jpg',box:[660,10,630,1840],sw:7,r:30,fs:34,lab:[0,-58],
    knob:i=>[[900,197],[910,88],[1080,123],[1097,213]][i],
    str:i=>{const n=[974,993,1010,1026][i],b=[955,987,1020,1052][i];
      return[[[966,193],[982,88],[1016,127],[1030,213]][i],[n,302],[n+(b-n)*1.024,1795]]}},
  bass5:{src:'img/bass-5.jpg',box:[0,0,600,600],sw:4,r:0,fs:0,
    str:i=>{const x=y=>301+(i-2)*(14.5+y*.0058);return[[x(20),20],[x(520),520]]}}
};
function drawGuitar(){
  const st=strs(),p=PH[S.inst],[bx,by,bw,bh]=p.box,tall=bh>bw;
  const g=st.map((s,i)=>{
    const pts=p.str(i).map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ');let k='';
    if(p.r){const[kx,ky]=p.knob(i);
      k=`<circle class="ring" cx="${kx}" cy="${ky}" r="${p.r}" stroke-width="${p.sw+1}"/><text x="${kx+p.lab[0]}" y="${ky+p.lab[1]}" font-size="${p.fs}" text-anchor="middle">${nm(s)}</text>`}
    return `<g class="sg" data-i="${i}"><polyline class="str" points="${pts}" fill="none" stroke-width="${p.sw}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="transparent" stroke-width="${p.sw*5}"/>${k}</g>`}).join('');
  $('#guitar').innerHTML=`<svg viewBox="${p.box.join(' ')}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${TITLES[S.inst]}" style="aspect-ratio:${bw}/${bh};${tall?'height:min(660px,80vh);width:auto':'width:100%;height:auto'};max-width:100%"><image href="${p.src}" x="${bx}" y="${by}" width="${bw}" height="${bh}" style="mix-blend-mode:${S.inst==='guitar6'?'normal':'multiply'}"/>${g}</svg>`;
}

/* horizontal string detail */
function drawDetail(){
  const st=strs(),n=st.length,y=i=>22+i*100/(n-1);let fr='';
  for(let f=1;f<=12;f++){const x=50+(1-Math.pow(2,-f/12))*1080;fr+=`<line x1="${x}" x2="${x}" y1="8" y2="132" stroke="#5a4636" stroke-width="1.5"/>`}
  const g=st.map((s,i)=>`<g class="ds" data-i="${i}"><line class="s" x1="50" x2="590" y1="${y(i)}" y2="${y(i)}" stroke-width="${sw(i,n)}"/><line x1="50" x2="590" y1="${y(i)}" y2="${y(i)}" stroke="transparent" stroke-width="14"/><text x="38" y="${y(i)+4}" text-anchor="end">${nm(s)}${oc(s)}</text></g>`).join('');
  $('#detail').innerHTML=`<svg viewBox="0 0 620 156"><rect x="50" y="8" width="540" height="124" rx="4" fill="#2d221a" stroke="#6b4a2f"/>${fr}<rect x="46" y="8" width="6" height="124" fill="#cfc8b6"/>${g}<text class="end" x="52" y="150">NUT</text><text class="end" x="590" y="150" text-anchor="end">BRIDGE</text></svg>`;
}
function drawCards(){const st=strs(),n=st.length;
  $('#cards').innerHTML=st.map((s,i)=>`<button type="button" class="card" data-i="${i}"><b>${nm(s)}${oc(s)}</b><small>String ${n-i}</small></button>`).join('')}

/* tap a string, peg or card: lock it and hear its note; tap again to unlock */
document.addEventListener('click',e=>{const el=e.target.closest('[data-i]');if(!el)return;
  const i=+el.dataset.i;if(S.mode==='chrom')setMode('auto');
  if(S.lock===i){S.lock=-1}else{S.lock=i;playTone(freq(strs()[i]))}
  S.sel=i;mark(false)});

function mark(ok){
  document.querySelectorAll('[data-i]').forEach(el=>{const me=+el.dataset.i===S.sel;el.classList.toggle('on',me);el.classList.toggle('ok',me&&!!ok)});
  const n=strs().length;
  $('#sel').textContent=S.sel<0?'No string selected':`String ${n-S.sel} — ${strs()[S.sel]}`;
  $('#badge').textContent=S.lock>=0?'Locked':S.sel<0?'':S.running?'Active':'Selected';
}
function idle(){
  S.target=0;$('#bar').classList.add('idle');document.body.classList.remove('tuned');document.body.classList.add('waiting');
  $('#note').textContent='--';$('#oct').textContent='';$('#hz').textContent='-- Hz';
  $('#state').textContent=S.running?'Listening…':'Waiting for input';mark(false);
}
function rebuild(full){
  S.lock=-1;if(full)drawControls();
  $('#gt').textContent=TITLES[S.inst];$('#gcount').textContent=strs().length+' strings';
  drawGuitar();drawDetail();drawCards();S.sel=S.mode==='chrom'?-1:0;idle();
}

/* microphone + detection */
let analyser,buf,timer;
async function start(){
  if(S.running)return stop();
  try{
    actx=actx||new(window.AudioContext||window.webkitAudioContext)();await actx.resume();
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    analyser=actx.createAnalyser();analyser.fftSize=8192;actx.createMediaStreamSource(stream).connect(analyser);
    buf=new Float32Array(analyser.fftSize);S.stream=stream;S.running=true;
    document.body.classList.add('running');$('#dot').classList.add('on');$('#live').textContent='Live';
    $('#status').textContent='Microphone live';$('#start').textContent='Stop tuner';$('#start').classList.add('on');
    timer=setInterval(detect,90);idle();
  }catch(e){$('#status').textContent=location.protocol==='file:'?'Mic blocked on local file - see notes':'Allow microphone access'}
}
function stop(){
  clearInterval(timer);S.running=false;S.stream&&S.stream.getTracks().forEach(x=>x.stop());
  document.body.classList.remove('running');$('#dot').classList.remove('on');$('#live').textContent='Idle';
  $('#status').textContent='Audio engine ready';$('#start').textContent='Start tuner';$('#start').classList.remove('on');idle();
}
$('#start').onclick=start;

function detect(){
  analyser.getFloatTimeDomainData(buf);
  let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);
  const now=performance.now();
  if(rms<0.01){if(now-S.lastHit>900&&!document.body.classList.contains('waiting')){S.hist=[];idle()}return}
  const fs=strs().map(freq),chrom=S.mode==='chrom';
  const f=yin(buf,actx.sampleRate,chrom?30:Math.min(...fs)*.7,chrom?1400:Math.max(...fs)*1.4);
  if(f<0)return;
  S.hist.push(f);if(S.hist.length>4)S.hist.shift();
  S.lastHit=now;show([...S.hist].sort((a,b)=>a-b)[S.hist.length>>1]);
}
function show(f){
  let cents,name,o;
  if(S.mode==='chrom'){const m=69+12*Math.log2(f/S.a4),r=Math.round(m);cents=(m-r)*100;name=NAMES[((r%12)+12)%12];o=Math.floor(r/12)-1;S.sel=-1}
  else{const fs=strs().map(freq);let i=S.lock;
    if(i<0){i=0;fs.forEach((v,k)=>{if(Math.abs(Math.log(f/v))<Math.abs(Math.log(f/fs[i])))i=k})}
    cents=1200*Math.log2(f/fs[i]);name=nm(strs()[i]);o=oc(strs()[i]);S.sel=i}
  const ok=Math.abs(cents)<=5;
  S.target=Math.max(-50,Math.min(50,cents));$('#bar').classList.remove('idle');
  document.body.classList.remove('waiting');document.body.classList.toggle('tuned',ok);
  $('#note').textContent=name;$('#oct').textContent=o;$('#hz').textContent=f.toFixed(1)+' Hz';
  $('#state').textContent=ok?'In tune':(cents<0?'Flat – tighten':'Sharp – loosen')+' · '+(cents>0?'+':'')+cents.toFixed(0)+' cents';
  mark(ok);
}

/* gauge + boot */
(()=>{let h='';for(let c=-50;c<=50;c+=5)h+=`<i class="${c%25?'':'big'} ${c?'':'zero'}" style="left:${c+50}%"></i>`;$('#ticks').innerHTML=h})();
(function loop(){S.pos+=(S.target-S.pos)*.2;$('#bar').style.left=(S.pos+50)+'%';requestAnimationFrame(loop)})();
S.tuning=Object.keys(INSTRUMENTS[S.inst].tunings)[0];
rebuild(true);
