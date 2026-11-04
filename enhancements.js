(function(){
  const style=document.createElement('style');
  style.textContent=`
    .map:after{background:linear-gradient(180deg,#ffffff24,#00000044),url('./hunt-app-icon.png') center/contain no-repeat!important;filter:brightness(1.28) saturate(1.12)}
    .photo-bg{background-position:center 38%!important;background-size:cover!important;filter:saturate(1.12) contrast(1.02) brightness(1.18)!important}
    .map-fullscreen{position:fixed!important;inset:0!important;z-index:30;background:#071018f7!important;padding:20px 18px 100px!important;overflow:auto;border-radius:0!important;margin:0!important;max-width:none!important}
    .map-fullscreen #hostMap{height:calc(100vh - 250px)!important;min-height:360px}
    .map-close{display:none;position:absolute;right:18px;top:18px;z-index:3}
    .map-fullscreen .map-close{display:block}
    .ready-action{width:100%;margin-top:12px}
    .mode-description{display:block;color:var(--muted);font-size:11px;line-height:1.35;margin-top:6px}
    .hunter-live-map{height:260px;border-radius:15px;border:1px solid #55733e;overflow:hidden;background:#142118;position:relative;margin:18px 0}
    .hunter-live-map .ping-label{position:absolute;z-index:500;left:12px;top:11px;padding:6px 9px;border-radius:999px;background:#071018dd;color:var(--lime);font-size:10px;font-weight:900;letter-spacing:.1em}
    .hunter-live-map .waiting-ping{position:absolute;inset:0;display:grid;place-items:center;color:#c7f36b99;font-size:11px;font-weight:900;letter-spacing:.1em;pointer-events:none}
    @media (max-width:700px){.photo-bg{background-position:58% center!important;background-size:auto 100%!important}.map-fullscreen{padding:16px 12px calc(90px + env(safe-area-inset-bottom))!important}.map-fullscreen #hostMap{height:calc(100vh - 220px)!important;min-height:320px}}
  `;
  document.head.append(style);
  let latest=null, mapWired=false, lastArea='', liveMap=null, liveLayer=null, lastPing=-1;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const code=()=>sessionStorage.getItem('hunt-code');
  const player=()=>sessionStorage.getItem('hunt-player');
  async function api(path,options={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
  const modeDescriptions={
    Classic:'Runners are out when tagged. A clean, simple chase.',
    Infection:'Tagged runners switch sides and become hunters.',
    'Freeze tag':'Tagged runners freeze until a teammate thaws them.',
    'Closing net':'The safe zone tightens after each ping wave.',
    Blackout:'No scheduled ping waves. Hunters must search manually.',
    'VIP escort':'Runners protect one VIP and get the VIP to safety.'
  };
  function wireModeDescriptions(){['#adminMode','#mode'].forEach(sel=>{const select=document.querySelector(sel);if(!select||select.dataset.described)return;select.dataset.described='1';const note=document.createElement('small');note.className='mode-description';select.after(note);const update=()=>{note.textContent=modeDescriptions[select.value]||''};select.addEventListener('change',update);update()})}
  async function centerFromTypedArea(area){
    if(!area||area===lastArea)return;lastArea=area;
    try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(area));const hits=await r.json();if(!hits[0])return;const center=[Number(hits[0].lat),Number(hits[0].lon)];if(typeof ensureHostMap==='function')ensureHostMap(center);try{if(typeof hostMap!=='undefined'&&hostMap)hostMap.setView(center,14)}catch(_){}}catch(_){}
  }
  function ensureHunterMap(g){
    const me=g.players.find(p=>p.id===player());const game=document.querySelector('#game');if(!game||!me||g.status!=='live')return;
    const old=game.querySelector('.radar');if(!old&&game.querySelector('#hunterPingMap')){if(me.role!=='HUNTER')game.querySelector('#hunterPingMap').style.display='none';return}
    if(me.role!=='HUNTER')return;
    let mapEl=game.querySelector('#hunterPingMap');
    if(!mapEl){mapEl=document.createElement('div');mapEl.id='hunterPingMap';mapEl.className='hunter-live-map';mapEl.innerHTML='<div class="ping-label">HUNTER MAP · PING MEMORY</div><div class="waiting-ping">WAITING FOR THE FIRST PING</div>';if(old)old.replaceWith(mapEl);else game.querySelector('.notice')?.before(mapEl)}
    if(window.L&&!liveMap){liveMap=L.map(mapEl,{zoomControl:true}).setView([40.2338,-111.6585],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(liveMap);liveLayer=L.layerGroup().addTo(liveMap)}
    const snapshot=Object.values(g.pingSnapshot||{});const waiting=mapEl.querySelector('.waiting-ping');if(waiting)waiting.style.display=snapshot.length?'none':'grid';
    if(g.pingWave!==lastPing){lastPing=g.pingWave;if(liveLayer){liveLayer.clearLayers();snapshot.forEach((p,i)=>L.circleMarker([p.latitude,p.longitude],{radius:10,color:'#ff6b6b',fillColor:'#ff6b6b',fillOpacity:.85,weight:3}).bindTooltip('Runner ping '+(i+1)).addTo(liveLayer));if(snapshot.length)liveMap.fitBounds(snapshot.map(p=>[p.latitude,p.longitude]),{padding:[35,35],maxZoom:16})}}
    setTimeout(()=>liveMap?.invalidateSize(),80);
  }
  function wireReady(){
    if(!document.querySelector('#lobby')||document.querySelector('#readyBtn'))return;
    const start=document.querySelector('#startBtn');if(!start)return;
    const btn=document.createElement('button');btn.id='readyBtn';btn.className='btn ready-action';btn.textContent='Tap Ready';start.before(btn);
    btn.onclick=async()=>{try{const me=latest?.players.find(p=>p.id===player());const next=!me?.ready;const d=await api('/api/games/'+code()+'/ready',{method:'POST',body:JSON.stringify({playerId:player(),ready:next})});render(d.game)}catch(e){window.toast?.(e.message)}};
  }
  function wireMap(){
    const map=document.querySelector('#hostMap'),card=document.querySelector('#mapCard');if(!map||!card||mapWired)return;mapWired=true;
    const close=document.createElement('button');close.id='closeMap';close.className='mini map-close';close.textContent='× Close full screen';card.prepend(close);
    const full=open=>{card.classList.toggle('map-fullscreen',open);window.hostMap?.invalidateSize?.()};
    close.onclick=()=>full(false);
    map.addEventListener('click',()=>{if(!window.drawBoundaryMode)full(true)});
  }
  function wireHunterSetting(isHost){
    const card=document.querySelector('#adminCard');if(!card||!isHost)return;
    let field=document.querySelector('#adminHunterCount');
    if(!field){const wrap=document.createElement('div');wrap.className='adminfield';wrap.innerHTML='<label>NUMBER OF HUNTERS</label><select id="adminHunterCount"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>';const grid=card.querySelector('.admingrid');const max=grid?.querySelector('#adminMax')?.closest('.adminfield');if(max)max.before(wrap);else grid?.prepend(wrap);field=wrap.querySelector('select');field.onchange=async()=>{try{await api('/api/games/'+code()+'/config',{method:'POST',body:JSON.stringify({hostId:player(),hunterCount:Number(field.value)})});window.toast?.('Hunter count saved')}catch(e){window.toast?.(e.message)}}}
    if(field&&latest?.rules?.hunterCount)field.value=String(latest.rules.hunterCount);
  }
  function render(g){
    latest=g;wireReady();wireModeDescriptions();const id=player(),isHost=id===g.hostId,allReady=g.players.length>=2&&g.players.every(p=>p.ready);
    const list=document.querySelector('.players');if(list)list.innerHTML=g.players.map(p=>'<div class="player"><div>'+esc(p.name)+'<small>'+(p.ready?'ready':'waiting')+' · location '+(p.locationShared?'on':'off')+'</small></div><span class="role">'+(p.role==='UNASSIGNED'?'WAITING':esc(p.role))+'</span></div>').join('');
    ['adminCard','mapCard','videoRules','toolbar'].forEach(id=>{const el=document.getElementById(id)||document.querySelector('.'+id);if(el)el.style.display=isHost?'block':'none'});
    const start=document.querySelector('#startBtn');if(start){start.style.display=isHost&&g.status==='lobby'?'block':'none';start.disabled=!allReady;start.textContent=allReady?'Start game':'Waiting for Ready';}
    const ready=document.querySelector('#readyBtn'),me=g.players.find(p=>p.id===id);if(ready&&me){ready.dataset.ready=String(!!me.ready);ready.textContent=me.ready?'Ready ✓':'Tap Ready';}
    const gameRole=document.querySelector('#game .role');if(gameRole&&me&&g.status==='live')gameRole.textContent='YOU: '+(me.role==='HUNTER'?'HUNTER':'RUNNER');
    wireHunterSetting(isHost);if(isHost){wireMap();centerFromTypedArea(g.area)}ensureHunterMap(g);
  }
  async function sync(){const c=code();if(!c)return;try{const d=await api('/api/games/'+c+'?playerId='+encodeURIComponent(player()||''));render(d.game)}catch(_){} }
  setInterval(sync,1000);setTimeout(sync,250);
})();

