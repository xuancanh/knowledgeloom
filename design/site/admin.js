/* Knowledge Loom — staff console data + rendering */
(function () {
  // ——————————————————————————— seed data ———————————————————————————
  const PLAN_META = {
    Thread:  { dot: 'teal',    price: 0 },
    Weaver:  { dot: 'oxblood', price: 9 },
    Atelier: { dot: 'ochre',   price: 18 },
    Guild:   { dot: 'indigo',  price: null },
  };
  const avColor = { teal: 'var(--teal)', oxblood: 'var(--accent)', ochre: 'var(--ochre)', indigo: 'var(--indigo)', moss: 'var(--moss)', rust: 'var(--rust)' };

  const CUSTOMERS = [
    { id:'ac_1042', name:'Marisol Vega', email:'marisol@cadencelabs.io', org:'Cadence Labs', plan:'Atelier', seats:24, status:'active', mrr:432, joined:'2025-11-02', last:'2h ago', notes:3120, codex:842, learn:210, region:'US-East' },
    { id:'ac_1039', name:'Dr. Priya Nayar', email:'priya@meridian.org', org:'Meridian', plan:'Weaver', seats:1, status:'active', mrr:9, joined:'2026-01-14', last:'1h ago', notes:684, codex:512, learn:96, region:'US-West' },
    { id:'ac_1051', name:'Tomas Lindqvist', email:'tomas@northwind.se', org:'Northwind', plan:'Weaver', seats:1, status:'active', mrr:9, joined:'2025-09-21', last:'20m ago', notes:1204, codex:988, learn:145, region:'EU' },
    { id:'ac_1077', name:'Halden & Co.', email:'billing@halden.co', org:'Halden & Co.', plan:'Atelier', seats:8, status:'past-due', mrr:144, joined:'2025-12-08', last:'3d ago', notes:940, codex:301, learn:64, region:'EU' },
    { id:'ac_1090', name:'Ben Osei', email:'b.osei@atrium.ac.uk', org:'The Atrium', plan:'Weaver', seats:1, status:'trial', mrr:0, joined:'2026-06-28', last:'5h ago', notes:88, codex:40, learn:12, region:'EU' },
    { id:'ac_1012', name:'Fieldnote', email:'ops@fieldnote.dev', org:'Fieldnote', plan:'Guild', seats:120, status:'active', mrr:2160, joined:'2025-04-17', last:'11m ago', notes:18400, codex:6210, learn:1802, region:'US-East' },
    { id:'ac_1103', name:'Hana Ito', email:'hana.ito@halden.co', org:'Halden & Co.', plan:'Thread', seats:1, status:'active', mrr:0, joined:'2026-05-30', last:'1d ago', notes:212, codex:20, learn:48, region:'APAC' },
    { id:'ac_1058', name:'Grigor Petrov', email:'grigor@fieldnote.dev', org:'Fieldnote', plan:'Weaver', seats:1, status:'active', mrr:9, joined:'2025-10-11', last:'4h ago', notes:1520, codex:1340, learn:88, region:'EU' },
    { id:'ac_1120', name:'Elena Duarte', email:'elena@brightpath.io', org:'Brightpath', plan:'Atelier', seats:12, status:'active', mrr:216, joined:'2026-03-02', last:'6h ago', notes:2200, codex:640, learn:150, region:'US-West' },
    { id:'ac_1131', name:'Ravi Chandran', email:'ravi@independent.me', org:'—', plan:'Thread', seats:1, status:'active', mrr:0, joined:'2026-06-19', last:'2d ago', notes:96, codex:12, learn:20, region:'APAC' },
    { id:'ac_0998', name:'Aoife Byrne', email:'aoife@lantern.ie', org:'Lantern', plan:'Weaver', seats:1, status:'canceled', mrr:0, joined:'2025-07-30', last:'22d ago', notes:430, codex:210, learn:30, region:'EU' },
    { id:'ac_1144', name:'Studio Verdant', email:'admin@verdant.studio', org:'Studio Verdant', plan:'Atelier', seats:5, status:'trial', mrr:0, joined:'2026-07-01', last:'8h ago', notes:140, codex:88, learn:22, region:'US-East' },
    { id:'ac_0975', name:'Marcus Feld', email:'marcus.feld@gmail.com', org:'—', plan:'Weaver', seats:1, status:'churned', mrr:0, joined:'2025-06-12', last:'40d ago', notes:210, codex:60, learn:8, region:'US-East' },
    { id:'ac_1156', name:'Kestrel Institute', email:'it@kestrel.org', org:'Kestrel Institute', plan:'Guild', seats:60, status:'active', mrr:1080, joined:'2026-02-20', last:'30m ago', notes:9200, codex:3010, learn:940, region:'US-West' },
  ];

  const RENEWALS = [
    { org:'Cadence Labs', plan:'Atelier', amount:432, when:'Jul 12', seats:24 },
    { org:'Fieldnote', plan:'Guild', amount:2160, when:'Jul 17', seats:120 },
    { org:'Brightpath', plan:'Atelier', amount:216, when:'Jul 22', seats:12 },
    { org:'Meridian', plan:'Weaver', amount:9, when:'Jul 24', seats:1 },
    { org:'Kestrel Institute', plan:'Guild', amount:1080, when:'Jul 28', seats:60 },
  ];

  const DUNNING = [
    { org:'Halden & Co.', plan:'Atelier', amount:144, attempts:2, reason:'Card declined — insufficient funds', next:'Jul 08' },
    { org:'Lumen Studio', plan:'Weaver', amount:9, attempts:1, reason:'Expired card', next:'Jul 07' },
    { org:'Vireo Research', plan:'Atelier', amount:90, attempts:3, reason:'Do not honor', next:'Final notice' },
  ];

  const TICKETS = [
    { id:'#4821', subj:'Codex research stuck in "researching"', who:'Grigor Petrov', org:'Fieldnote', pri:'high', status:'open', age:'22m' },
    { id:'#4820', subj:'Request refund for duplicate Atelier charge', who:'Halden & Co.', org:'Halden & Co.', pri:'high', status:'open', age:'1h' },
    { id:'#4818', subj:'How do I import from Roam?', who:'Ravi Chandran', org:'—', pri:'low', status:'pending', age:'3h' },
    { id:'#4815', subj:'SSO / SAML setup for Guild', who:'Kestrel Institute', org:'Kestrel Institute', pri:'med', status:'open', age:'5h' },
    { id:'#4810', subj:'Learn podcast audio cuts out mid-session', who:'Hana Ito', org:'Halden & Co.', pri:'med', status:'pending', age:'8h' },
    { id:'#4802', subj:'Export whole vault as Markdown', who:'Elena Duarte', org:'Brightpath', pri:'low', status:'resolved', age:'1d' },
    { id:'#4799', subj:'Seat count not updating after removing member', who:'Cadence Labs', org:'Cadence Labs', pri:'med', status:'open', age:'1d' },
  ];

  const FLAGS = [
    { name:'Multiplayer live cursors', key:'weave.presence.cursors', on:true, roll:100, scope:'All Atelier & Guild' },
    { name:'Codex v3 research model', key:'codex.model.v3', on:true, roll:35, scope:'35% rollout' },
    { name:'Podcast — 3rd host voice', key:'learn.podcast.trio', on:false, roll:0, scope:'Internal only' },
    { name:'Weave auto-layout (force graph)', key:'weave.autolayout', on:true, roll:80, scope:'80% rollout' },
    { name:'Annual billing upsell banner', key:'billing.annual.banner', on:true, roll:100, scope:'All web' },
    { name:'AI note-merge suggestions', key:'notes.merge.ai', on:false, roll:5, scope:'Beta cohort' },
    { name:'Mobile capture (PWA)', key:'app.pwa.capture', on:true, roll:50, scope:'50% rollout' },
  ];

  const AUDIT = [
    { who:'You (S. Okafor)', action:'Issued refund $144.00 to Halden & Co.', target:'ac_1077', when:'Just now', kind:'billing' },
    { who:'M. Reyes', action:'Impersonated user session', target:'ac_1058', when:'14m ago', kind:'access' },
    { who:'You (S. Okafor)', action:'Enabled flag codex.model.v3 → 35%', target:'flag', when:'1h ago', kind:'flag' },
    { who:'System', action:'Dunning: retry failed for Vireo Research', target:'ac_—', when:'2h ago', kind:'billing' },
    { who:'A. Kim', action:'Downgraded Aoife Byrne to Thread', target:'ac_0998', when:'3h ago', kind:'plan' },
    { who:'M. Reyes', action:'Resolved ticket #4802', target:'#4802', when:'5h ago', kind:'support' },
    { who:'You (S. Okafor)', action:'Exported customers report (CSV)', target:'—', when:'Yesterday', kind:'export' },
    { who:'A. Kim', action:'Granted staff role to j.torres@loom.co', target:'staff', when:'Yesterday', kind:'access' },
  ];

  // ——————————————————————————— helpers ———————————————————————————
  const $ = (s, r=document) => r.querySelector(s);
  const initials = (n) => n.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '—';
  const planDot = (p) => `<span class="plan-tag"><span class="dot ${PLAN_META[p].dot}"></span>${p}</span>`;
  const statusPill = (s) => { const label = {'active':'Active','trial':'Trial','past-due':'Past due','canceled':'Canceled','churned':'Churned'}[s]; return `<span class="pill ${s}"><span class="d2"></span>${label}</span>`; };
  const money = (n) => n == null ? '—' : '$' + n.toLocaleString();

  // ——— svg charts ———
  function areaChart(el, data, color, { h=180, labels=[] } = {}) {
    const w = el.clientWidth || 640; const pad = { l:8, r:8, t:12, b:22 };
    const max = Math.max(...data) * 1.12; const min = 0;
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const x = i => pad.l + (i/(data.length-1)) * iw;
    const y = v => pad.t + ih - ((v-min)/(max-min)) * ih;
    let line = data.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    let area = line + ` L${x(data.length-1).toFixed(1)},${(pad.t+ih)} L${x(0)},${(pad.t+ih)} Z`;
    let grid = '';
    for (let g=0; g<=3; g++){ const gy = pad.t + (ih/3)*g; grid += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${w-pad.r}" y2="${gy}"/>`; }
    let lab = labels.map((l,i)=>`<text class="axis-lab" x="${x(i*(data.length-1)/(labels.length-1))}" y="${h-6}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${l}</text>`).join('');
    let dots = `<circle cx="${x(data.length-1)}" cy="${y(data[data.length-1])}" r="3.5" fill="${color}"/>`;
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${grid}<path class="area-fill" d="${area}" fill="${color}"/><path class="line-path" d="${line}" stroke="${color}"/>${dots}${lab}</svg>`;
  }
  function barChart(el, series, { h=180, labels=[], colors=[] } = {}) {
    const w = el.clientWidth || 640; const pad = { l:8, r:8, t:12, b:22 };
    const n = series[0].data.length; const max = Math.max(...series.flatMap(s=>s.data)) * 1.15;
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const group = iw / n; const bw = Math.min(26, (group * 0.62) / series.length);
    let grid=''; for (let g=0; g<=3; g++){ const gy=pad.t+(ih/3)*g; grid+=`<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${w-pad.r}" y2="${gy}"/>`; }
    let bars='';
    for (let i=0;i<n;i++){ const gx = pad.l + group*i + group/2; const total = series.length; const start = gx - (total*bw)/2;
      series.forEach((s,si)=>{ const bh=((s.data[i])/max)*ih; const bx=start+si*bw; bars+=`<rect class="bar" x="${bx}" y="${pad.t+ih-bh}" width="${bw-2}" height="${bh}" fill="${s.color}"/>`; }); }
    let lab = labels.map((l,i)=>`<text class="axis-lab" x="${pad.l+group*i+group/2}" y="${h-6}" text-anchor="middle">${l}</text>`).join('');
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${grid}${bars}${lab}</svg>`;
  }
  function donut(el, parts, { size=150 } = {}) {
    const total = parts.reduce((a,p)=>a+p.v,0); const r=size/2, ir=r*0.6; let a0=-Math.PI/2; let seg='';
    parts.forEach(p=>{ const a1=a0+(p.v/total)*Math.PI*2; const x0=r+r*Math.cos(a0),y0=r+r*Math.sin(a0),x1=r+r*Math.cos(a1),y1=r+r*Math.sin(a1);
      const xi0=r+ir*Math.cos(a1),yi0=r+ir*Math.sin(a1),xi1=r+ir*Math.cos(a0),yi1=r+ir*Math.sin(a0); const large=(a1-a0)>Math.PI?1:0;
      seg+=`<path d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi0},${yi0} A${ir},${ir} 0 ${large} 0 ${xi1},${yi1} Z" fill="${p.color}"/>`; a0=a1; });
    el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${seg}<circle cx="${r}" cy="${r}" r="${ir-1}" fill="var(--surface)"/></svg>`;
  }

  // ——————————————————————————— render tables ———————————————————————————
  let curFilter = { status:'all', plan:'all', q:'' };
  function renderCustomers() {
    const rows = CUSTOMERS.filter(c => {
      if (curFilter.status !== 'all' && c.status !== curFilter.status) return false;
      if (curFilter.plan !== 'all' && c.plan !== curFilter.plan) return false;
      if (curFilter.q && !(c.name+c.email+c.org).toLowerCase().includes(curFilter.q.toLowerCase())) return false;
      return true;
    });
    $('#custBody').innerHTML = rows.map(c => `
      <tr data-id="${c.id}">
        <td><div class="cell-name"><span class="av" style="background:${avColor[PLAN_META[c.plan].dot]}">${initials(c.name)}</span><div><div class="nm">${c.name}</div><div class="em">${c.email}</div></div></div></td>
        <td>${planDot(c.plan)}</td>
        <td>${statusPill(c.status)}</td>
        <td class="num mono-cell">${c.seats}</td>
        <td class="num mono-cell">${money(c.mrr)}</td>
        <td class="mono-cell mut">${c.joined}</td>
        <td class="mono-cell mut">${c.last}</td>
      </tr>`).join('');
    $('#custCount').textContent = rows.length + ' of ' + CUSTOMERS.length;
    $('#custBody').querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => openDrawer(tr.dataset.id)));
  }

  function renderRenewals() {
    $('#renewBody').innerHTML = RENEWALS.map(r => `
      <tr><td><b style="color:var(--ink)">${r.org}</b></td><td>${planDot(r.plan)}</td><td class="num mono-cell">${r.seats}</td><td class="num mono-cell">${money(r.amount)}</td><td class="mono-cell mut">${r.when}</td></tr>`).join('');
  }
  function renderDunning() {
    $('#dunBody').innerHTML = DUNNING.map(d => `
      <tr>
        <td><b style="color:var(--ink)">${d.org}</b><div class="em mono-cell mut" style="margin-top:2px;">${d.reason}</div></td>
        <td>${planDot(d.plan)}</td>
        <td class="num mono-cell">${money(d.amount)}</td>
        <td class="mono-cell"><span class="pill past-due"><span class="d2"></span>Attempt ${d.attempts}</span></td>
        <td class="mono-cell mut">${d.next}</td>
        <td class="num"><button class="btn btn-ghost btn-sm">Retry</button></td>
      </tr>`).join('');
  }
  function renderTickets() {
    const priPill = { high:'churned', med:'past-due', low:'canceled' };
    const stPill = { open:'trial', pending:'past-due', resolved:'active' };
    $('#ticketBody').innerHTML = TICKETS.map(t => `
      <tr>
        <td class="mono-cell mut">${t.id}</td>
        <td><b style="color:var(--ink)">${t.subj}</b></td>
        <td>${t.who}<div class="em mono-cell mut">${t.org}</div></td>
        <td><span class="pill ${priPill[t.pri]}"><span class="d2"></span>${t.pri.toUpperCase()}</span></td>
        <td><span class="pill ${stPill[t.status]}"><span class="d2"></span>${t.status}</span></td>
        <td class="mono-cell mut num">${t.age}</td>
      </tr>`).join('');
  }
  function renderFlags() {
    $('#flagBody').innerHTML = FLAGS.map((f,i) => `
      <div class="flag-row">
        <div class="info"><div class="fn">${f.name}</div><div class="fk">${f.key}</div></div>
        <div class="seg-scope">${f.scope}</div>
        <div class="roll">${f.roll}%</div>
        <div class="tgl ${f.on?'on':''}" data-fi="${i}"></div>
      </div>`).join('');
    $('#flagBody').querySelectorAll('.tgl').forEach(t => t.addEventListener('click', () => t.classList.toggle('on')));
  }
  function renderAudit() {
    const kindColor = { billing:'ochre', access:'rust', flag:'indigo', plan:'moss', support:'teal', export:'oxblood' };
    $('#auditBody').innerHTML = AUDIT.map(a => `
      <tr>
        <td><span class="plan-tag"><span class="dot ${kindColor[a.kind]}"></span>${a.who}</span></td>
        <td style="color:var(--ink)">${a.action}</td>
        <td class="mono-cell mut">${a.target}</td>
        <td class="mono-cell mut num">${a.when}</td>
      </tr>`).join('');
  }

  // ——————————————————————————— drawer ———————————————————————————
  function openDrawer(id) {
    const c = CUSTOMERS.find(x => x.id === id); if (!c) return;
    const col = avColor[PLAN_META[c.plan].dot];
    $('#drAv').style.background = col; $('#drAv').textContent = initials(c.name);
    $('#drName').textContent = c.name; $('#drEmail').textContent = c.email + ' · ' + c.id;
    $('#drMeta').innerHTML = planDot(c.plan) + statusPill(c.status) + `<span class="pill canceled"><span class="d2"></span>${c.region}</span>`;
    $('#drStats').innerHTML = `
      <div class="dr-stat"><div class="v">${money(c.mrr)}</div><div class="k">MRR</div></div>
      <div class="dr-stat"><div class="v">${c.seats}</div><div class="k">Seats</div></div>
      <div class="dr-stat"><div class="v">${c.notes.toLocaleString()}</div><div class="k">Notes woven</div></div>
      <div class="dr-stat"><div class="v">${c.codex.toLocaleString()}</div><div class="k">Codex runs</div></div>
      <div class="dr-stat"><div class="v">${c.learn}</div><div class="k">Learn sessions</div></div>
      <div class="dr-stat"><div class="v">${c.org}</div><div class="k">Organisation</div></div>`;
    $('#drRows').innerHTML = `
      <div class="dr-row"><span class="l">Plan</span><span class="r">${c.plan}${c.seats>1?` · ${c.seats} seats`:''}</span></div>
      <div class="dr-row"><span class="l">Status</span><span class="r">${statusPill(c.status)}</span></div>
      <div class="dr-row"><span class="l">Joined</span><span class="r mono-cell">${c.joined}</span></div>
      <div class="dr-row"><span class="l">Last active</span><span class="r mono-cell">${c.last}</span></div>
      <div class="dr-row"><span class="l">Region</span><span class="r">${c.region}</span></div>
      <div class="dr-row"><span class="l">Lifetime value</span><span class="r mono-cell">${money(c.mrr*14)}</span></div>`;
    $('#drScrim').classList.add('open'); $('#drawer').classList.add('open');
  }
  function closeDrawer(){ $('#drScrim').classList.remove('open'); $('#drawer').classList.remove('open'); }

  // ——————————————————————————— tabs ———————————————————————————
  const TITLES = { overview:'Overview', customers:'Customers', subscriptions:'Subscriptions', analytics:'Product analytics', codex:'Codex & usage', support:'Support', flags:'Feature flags', audit:'Audit log' };
  function go(tab) {
    document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('active', p.id === 'tab-'+tab));
    document.querySelectorAll('.snav').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
    $('#pageTitle').textContent = TITLES[tab];
    location.hash = tab;
    drawCharts();
  }

  let drawn = {};
  function drawCharts() {
    // only draw visible-tab charts once sized
    if ($('#chRevenue') && !drawn.rev && $('#tab-overview').classList.contains('active')) {
      areaChart($('#chRevenue'), [148,162,171,180,196,210,228,251,268,290,318,347], 'var(--accent)', { labels:['Aug','Nov','Feb','May','Jul'] });
      donut($('#chPlanMix'), [ {v:6120,color:'var(--teal)'}, {v:3200,color:'var(--accent)'}, {v:4180,color:'var(--ochre)'}, {v:2400,color:'var(--indigo)'} ]);
      drawn.rev = true;
    }
    if ($('#chMrrPlan') && !drawn.mrr && $('#tab-subscriptions').classList.contains('active')) {
      barChart($('#chMrrPlan'), [{ data:[0, 12.4, 18.9, 15.2], color:'var(--accent)' }], { labels:['Thread','Weaver','Atelier','Guild'] });
      drawn.mrr = true;
    }
    if ($('#chDau') && !drawn.dau && $('#tab-analytics').classList.contains('active')) {
      areaChart($('#chDau'), [4.1,4.3,4.6,4.4,4.9,5.2,5.0,5.4,5.8,6.1,6.0,6.4], 'var(--indigo)', { labels:['wk1','wk4','wk8','wk12'] });
      drawn.dau = true;
    }
    if ($('#chCodex') && !drawn.cx && $('#tab-codex').classList.contains('active')) {
      barChart($('#chCodex'), [
        { data:[820,910,1040,980,1120,1210,1180], color:'var(--moss)' },
        { data:[140,160,150,180,170,190,175], color:'var(--ochre)' },
        { data:[30,24,40,28,35,22,26], color:'var(--rust)' },
      ], { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] });
      drawn.cx = true;
    }
  }

  // ——————————————————————————— boot ———————————————————————————
  document.addEventListener('DOMContentLoaded', () => {
    renderCustomers(); renderRenewals(); renderDunning(); renderTickets(); renderFlags(); renderAudit();
    document.querySelectorAll('.snav').forEach(n => n.addEventListener('click', () => go(n.dataset.tab)));
    $('#drScrim').addEventListener('click', closeDrawer);
    $('#drClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // customer filters
    document.querySelectorAll('#statusFilters .chip-filter').forEach(ch => ch.addEventListener('click', () => {
      document.querySelectorAll('#statusFilters .chip-filter').forEach(x => x.classList.remove('on')); ch.classList.add('on');
      curFilter.status = ch.dataset.v; renderCustomers();
    }));
    document.querySelectorAll('#planFilters .chip-filter').forEach(ch => ch.addEventListener('click', () => {
      document.querySelectorAll('#planFilters .chip-filter').forEach(x => x.classList.remove('on')); ch.classList.add('on');
      curFilter.plan = ch.dataset.v; renderCustomers();
    }));
    $('#custSearch').addEventListener('input', e => { curFilter.q = e.target.value; renderCustomers(); });

    // theme toggle
    $('#themeBtn')?.addEventListener('click', () => {
      const r = document.documentElement; const dark = r.getAttribute('data-theme') === 'dark';
      r.setAttribute('data-theme', dark ? 'light' : 'dark'); drawn = {}; document.querySelectorAll('svg.chart').forEach(s=>s.remove()); drawCharts();
    });

    const start = (location.hash || '#overview').slice(1);
    go(TITLES[start] ? start : 'overview');
    window.addEventListener('resize', () => { drawn = {}; document.querySelectorAll('#tab-overview svg, #tab-subscriptions svg, #tab-analytics svg, #tab-codex svg').forEach(s=>{ if(s.classList.contains('chart')) s.remove(); }); drawCharts(); });
  });
})();
