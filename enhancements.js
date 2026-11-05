(function(){
  const style=document.createElement('style');
  style.textContent=`
    .map:after{background:linear-gradient(180deg,#ffffff24,#00000044),url('./hunt-app-icon.png') center/contain no-repeat!important;filter:brightness(1.28) saturate(1.12)}
    .photo-bg{display:none!important}body:has(#home:not(.hidden)) .photo-bg{display:block!important;background-image:linear-gradient(180deg,#02060bb8,#05080dcc 55%,#020409e6),url('./codex-clipboard-fc799249-1f0d-4b78-9ef5-3c91a0745ee6.png')!important;background-position:center top!important;background-size:cover!important;filter:brightness(.9) contrast(1.08) saturate(.9)!important}.eyebrow,.badge{display:block!important}
    .map-fullscreen{position:fixed!important;inset:0!important;z-index:30;background:#071018f7!important;padding:20px 18px 100px!important;overflow:auto;border-radius:0!important;margin:0!important;max-width:none!important}
    .map-fullscreen #hostMap{height:calc(100vh - 250px)!important;min-height:360px}
    .map-close{display:none;position:absolute;right:18px;top:18px;z-index:3}
    .map-fullscreen .map-close{display:block}
    .ready-action{width:100%;margin-top:12px}
    .mode-description{display:block;color:var(--muted);font-size:11px;line-height:1.35;margin-top:6px}
    .hunter-picker{grid-column:1/-1;padding:12px;border:1px solid #ff9f4344;border-radius:12px;background:#ff9f430b}.hunter-picker>label{display:block;color:var(--orange);font-size:11px;font-weight:900;letter-spacing:.08em;margin-bottom:8px}.hunter-options{display:grid;gap:7px}.hunter-option{display:flex!important;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;background:#101a24;color:var(--ink)!important;font-size:13px!important;font-weight:600!important;margin:0!important}.hunter-option input{accent-color:var(--orange)}.hunter-help{display:block;color:var(--muted);font-size:11px;margin-top:8px}
    .hunt-loading{position:fixed;inset:0;z-index:1000;background:#05080b;color:#f5f7fa;display:grid;place-items:center;overflow:hidden}.hunt-loading.hidden{display:none}.hunt-loading img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.55) saturate(1.1)}.hunt-loading:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#05080b22,#05080bd9 78%,#05080b)}.hunt-loading-content{position:relative;z-index:1;text-align:center;padding:24px}.hunt-loading-kicker{color:var(--lime);font-size:11px;font-weight:900;letter-spacing:.22em}.hunt-loading h2{font-size:clamp(34px,9vw,72px);line-height:.92;letter-spacing:-.07em;margin:14px 0}.hunt-loading p{color:#c6d0d9;margin:0;font-size:14px}.hunt-loading-count{margin-top:18px;color:var(--lime);font-size:30px;font-weight:900;letter-spacing:.06em;text-shadow:0 0 20px #c7ff5266}
    .hunter-live-map{height:260px;border-radius:15px;border:1px solid #55733e;overflow:hidden;background:#142118;position:relative;margin:18px 0}
    .hunter-live-map .ping-label{position:absolute;z-index:500;left:12px;top:11px;padding:6px 9px;border-radius:999px;background:#071018dd;color:var(--lime);font-size:10px;font-weight:900;letter-spacing:.1em}
    .hunter-live-map .waiting-ping{position:absolute;inset:0;display:grid;place-items:center;color:#c7f36b99;font-size:11px;font-weight:900;letter-spacing:.1em;pointer-events:none}
    .shared-live-map{height:260px;border-radius:15px;border:1px solid #426176;overflow:hidden;background:#142118;position:relative;margin:18px 0}
    .shared-live-map .map-label{position:absolute;z-index:500;left:12px;top:11px;padding:6px 9px;border-radius:999px;background:#071018dd;color:#9ee8ff;font-size:10px;font-weight:900;letter-spacing:.1em}
    @media (max-width:700px){.photo-bg{background-position:center top!important;background-size:100% 100%!important;background-repeat:no-repeat!important;background-color:#061018!important;filter:saturate(1.08) contrast(1.06) brightness(1.32)!important}body{background-size:100% 100%!important;background-position:center top!important;background-repeat:no-repeat!important;background-attachment:scroll!important;background-color:#061018!important}.hero h1{color:#ffffff!important;text-shadow:0 3px 8px #000c!important}.hero h1 span{color:#c9edff!important;text-shadow:0 3px 8px #000c!important}.hero p,.sub,.stat span,.feature small,.notice{color:#e6f4ff!important;text-shadow:0 2px 5px #000b!important}.stat strong,.feature span,.feature b{color:#f7fbff!important;text-shadow:0 2px 5px #000b!important}.map-fullscreen{padding:16px 12px calc(90px + env(safe-area-inset-bottom))!important}.map-fullscreen #hostMap{height:calc(100vh - 220px)!important;min-height:320px}}
  `;
  document.head.append(style);
  let latest=null, latestSyncedAt=0, mapWired=false, lastArea='', liveMap=null, liveLayer=null, liveBoundary=null, lastPing=-1, seenPing=-1, timerHandle=null, boundaryWarning=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const code=()=>sessionStorage.getItem('hunt-code');
  const player=()=>sessionStorage.getItem('hunt-player');
  async function api(path,options={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
  let audioContext=null;
  function unlockAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioContext=audioContext||new C();if(audioContext.state==='suspended')audioContext.resume()}catch(_){} }
  function ding(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioContext=audioContext||new C();audioContext.resume?.();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=880;gain.gain.setValueAtTime(.0001,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.2,audioContext.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.32);osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.34);navigator.vibrate?.([120,70,120])}catch(_){} }
  function parseSeconds(value){const m=String(value||'').match(/(\d+(?:\.\d+)?)\s*(second|minute|hour)/i);if(!m)return 0;const n=Number(m[1]);return m[2].toLowerCase().startsWith('hour')?n*3600:m[2].toLowerCase().startsWith('minute')?n*60:n}
  function clock(total){total=Math.max(0,Math.floor(Number(total)||0));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')}
  function updateTimer(){const loading=document.querySelector('#huntLoading');if(loading&&latest?.status==='starting'){const left=Math.max(0,Number(latest.launchAt||0)-Date.now());const count=loading.querySelector('.hunt-loading-count');if(count)count.textContent='STARTING IN '+Math.ceil(left/1000);return}const el=document.querySelector('#timer');if(!el||!latest?.startedAt||latest.status!=='live')return;const sinceSync=Math.floor((Date.now()-latestSyncedAt)/1000);const total=Math.max(0,Number(latest.remainingSeconds??0)-sinceSync);el.textContent=clock(total);const ping=document.querySelector('#nextPingCountdown');if(ping){const p=latest.nextPingSeconds==null?null:Math.max(0,Number(latest.nextPingSeconds)-sinceSync);ping.textContent=p==null?'Next ping: off':p===0?'Next ping: now':'Next ping in '+clock(p)}}
  function ensureLoading(g){let overlay=document.querySelector('#huntLoading');if(!overlay){overlay=document.createElement('div');overlay.id='huntLoading';overlay.className='hunt-loading hidden';overlay.innerHTML='<img alt="HUNT loading scene"><div class="hunt-loading-content"><div class="hunt-loading-kicker">OUTDOOR GAME SYSTEM</div><h2>THE HUNT<br>BEGINS.</h2><p>Get ready. The zone is about to go live.</p><div class="hunt-loading-count">STARTING IN 5</div></div>';document.body.append(overlay)}if(g.status==='starting'){overlay.classList.remove('hidden');const img=overlay.querySelector('img');const src='/'+(g.launchImage||'hunt-loading-0.jpg');if(img.getAttribute('src')!==src)img.src=src}else overlay.classList.add('hidden')}
  function pointInside(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const xi=Number(polygon[i][1]),yi=Number(polygon[i][0]),xj=Number(polygon[j][1]),yj=Number(polygon[j][0]);const hit=((yi>point.latitude)!==(yj>point.latitude))&&(point.longitude<(xj-xi)*(point.latitude-yi)/(yj-yi)+xi);if(hit)inside=!inside}return inside}
  function checkBoundary(g){const me=g.players.find(p=>p.id===player());const point=window.huntLastLocation;if(!me||!point||g.status!=='live'||me.status==='tagged'||!g.zone)return;let inside=true;if(g.zone.type==='polygon'&&Array.isArray(g.zone.points)&&g.zone.points.length>=3)inside=pointInside(point,g.zone.points);else if(g.zone.type==='circle'&&g.zone.center&&g.zone.radius){const lat=Number(g.zone.center[0]),lng=Number(g.zone.center[1]);const dx=(point.longitude-lng)*111320*Math.cos(lat*Math.PI/180),dy=(point.latitude-lat)*110540;inside=Math.sqrt(dx*dx+dy*dy)<=Number(g.zone.radius)}const message='You have left the games boarder, please return';if(!inside&&!boundaryWarning){boundaryWarning=true;window.toast?.(message);navigator.vibrate?.([180,100,180]);if('Notification' in window&&Notification.permission==='granted')new Notification('HUNT',{body:message})}else if(inside)boundaryWarning=false}
  function wireAdminTiming(isHost){
    const card=document.querySelector('#adminCard');if(!card||!isHost)return;const grid=card.querySelector('.admingrid');if(!grid)return;
    const add=(id,label,options)=>{let field=document.querySelector('#'+id);if(field)return field;const wrap=document.createElement('div');wrap.className='adminfield';wrap.innerHTML='<label>'+label+'</label><select id="'+id+'">'+options.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join('')+'</select>';grid.prepend(wrap);field=wrap.querySelector('select');field.onchange=async()=>{try{const key=id==='adminAutoPing'?'autoPing':id==='adminPingSound'?'pingSound':id==='adminRunnerMap'?'runnerMap':'requireLocationSharing';await api('/api/games/'+code()+'/config',{method:'POST',body:JSON.stringify({hostId:player(),[key]:field.value==='on'})});window.toast?.('Setting saved')}catch(e){window.toast?.(e.message)}};return field};
    const auto=add('adminAutoPing','AUTO PINGS',[['on','On'],['off','Off']]);const sound=add('adminPingSound','PING DING',[['on','On'],['off','Off']]);const sharing=add('adminRequireLocation','REQUIRE RUNNER LOCATION',[['on','On'],['off','Off']]);const runner=add('adminRunnerMap','RUNNER LIVE MAP',[['on','On'],['off','Off']]);
    if(auto&&latest?.rules)auto.value=latest.rules.autoPing===false?'off':'on';if(sound&&latest?.rules)sound.value=latest.rules.pingSound===false?'off':'on';if(sharing&&latest?.rules)sharing.value=latest.rules.requireLocationSharing===false?'off':'on';if(runner&&latest?.rules)runner.value=latest.rules.runnerMap===false?'off':'on';
  }
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
  function zoneCenter(zone){if(zone?.type==='polygon'&&Array.isArray(zone.points)&&zone.points.length){const lat=zone.points.reduce((s,p)=>s+Number(p[0]),0)/zone.points.length,lng=zone.points.reduce((s,p)=>s+Number(p[1]),0)/zone.points.length;return [lat,lng]}if(zone?.type==='circle'&&zone.center)return [Number(zone.center[0]),Number(zone.center[1])];return null}
  function drawLiveBoundary(zone){if(!liveMap||!window.L)return;liveBoundary?.remove?.();liveBoundary=null;if(zone?.type==='polygon'&&Array.isArray(zone.points)&&zone.points.length>=3){liveBoundary=L.polygon(zone.points,{color:'#c7ff52',weight:3,fillColor:'#c7ff52',fillOpacity:.08}).addTo(liveMap);liveMap.fitBounds(liveBoundary.getBounds(),{padding:[28,28],maxZoom:16})}else if(zone?.type==='circle'&&zone.center&&zone.radius){liveBoundary=L.circle([Number(zone.center[0]),Number(zone.center[1])],{radius:Number(zone.radius),color:'#c7ff52',weight:3,fillColor:'#c7ff52',fillOpacity:.08}).addTo(liveMap);liveMap.fitBounds(liveBoundary.getBounds(),{padding:[28,28],maxZoom:16})}}
  function ensureLiveMap(g){
    const me=g.players.find(p=>p.id===player());const game=document.querySelector('#game');if(!game||!me||g.status!=='live')return;
    const hunter=me.role==='HUNTER';const old=game.querySelector('.radar');let mapEl=game.querySelector('#liveSharedMap');
    if(!mapEl){mapEl=document.createElement('div');mapEl.id='liveSharedMap';mapEl.className=hunter?'hunter-live-map':'shared-live-map';mapEl.innerHTML=hunter?'<div class="ping-label">HUNTER MAP · PING MEMORY</div><div class="waiting-ping">WAITING FOR THE FIRST PING</div>':'<div class="map-label">RUNNER MAP · LIVE CREW</div>';if(old)old.replaceWith(mapEl);else game.querySelector('.notice')?.before(mapEl)}
    mapEl.className=hunter?'hunter-live-map':'shared-live-map';
    const center=zoneCenter(g.zone)||[40.2338,-111.6585];
    if(window.L&&!liveMap){liveMap=L.map(mapEl,{zoomControl:true}).setView(center,15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(liveMap);liveLayer=L.layerGroup().addTo(liveMap);drawLiveBoundary(g.zone)}else if(liveMap&&!liveBoundary)drawLiveBoundary(g.zone);
    const selfLocation=window.huntLastLocation||g.locations?.[me.id];const points=hunter?{...(g.pingSnapshot||{}),...(selfLocation?{[me.id]:selfLocation}:{})}:{...(g.locations||{}),...(selfLocation?{[me.id]:selfLocation}:{})};const entries=Object.entries(points);const waiting=mapEl.querySelector('.waiting-ping');if(waiting)waiting.style.display=entries.length?'none':'grid';
    if(!hunter||g.pingWave!==lastPing){if(hunter)lastPing=g.pingWave;if(liveLayer){liveLayer.clearLayers();const byId=Object.fromEntries(g.players.map(p=>[p.id,p]));entries.forEach(([id,p])=>{const person=byId[id];const role=String(person?.role||(id===me.id?me.role:'RUNNER')).trim().toUpperCase();const color=person?.status==='tagged'?'#ff3b30':role==='HUNTER'?'#ff9f43':'#38a8ff';L.circleMarker([p.latitude,p.longitude],{radius:7,color,fillColor:color,fillOpacity:1,weight:2}).bindTooltip(person?.status==='tagged'?'Caught runner':person?.name||'Player').addTo(liveLayer)});if(!liveBoundary&&entries.length)liveMap.fitBounds(entries.map(([,p])=>[p.latitude,p.longitude]),{padding:[35,35],maxZoom:16})}}
    setTimeout(()=>liveMap?.invalidateSize(),80);
  }
  function wireReady(){
    if(!document.querySelector('#lobby')||document.querySelector('#readyBtn'))return;
    const start=document.querySelector('#startBtn');if(!start)return;
    const btn=document.createElement('button');btn.id='readyBtn';btn.className='btn ready-action';btn.textContent='Tap Ready';start.before(btn);
    btn.onclick=async()=>{unlockAudio();try{const me=latest?.players.find(p=>p.id===player());const next=!me?.ready;const d=await api('/api/games/'+code()+'/ready',{method:'POST',body:JSON.stringify({playerId:player(),ready:next})});render(d.game)}catch(e){window.toast?.(e.message)}};
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
    const grid=card.querySelector('.admingrid');if(!grid)return;
    let field=document.querySelector('#adminHunterCount');
    if(!field){const wrap=document.createElement('div');wrap.className='adminfield';wrap.innerHTML='<label>NUMBER OF HUNTERS</label><select id="adminHunterCount"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>';const max=grid.querySelector('#adminMax')?.closest('.adminfield');if(max)max.before(wrap);else grid.prepend(wrap);field=wrap.querySelector('select');field.onchange=async()=>{try{await api('/api/games/'+code()+'/config',{method:'POST',body:JSON.stringify({hostId:player(),hunterCount:Number(field.value)})});window.toast?.('Hunter count saved')}catch(e){window.toast?.(e.message)}}}
    if(field&&latest?.rules?.hunterCount)field.value=String(latest.rules.hunterCount);
    let mode=document.querySelector('#adminHunterSelection');
    if(!mode){const wrap=document.createElement('div');wrap.className='adminfield';wrap.innerHTML='<label>HUNTER SELECTION</label><select id="adminHunterSelection"><option value="random">Randomly choose hunters</option><option value="admin">Admin chooses hunters</option></select>';grid.prepend(wrap);mode=wrap.querySelector('select');mode.onchange=async()=>{const chosen=mode.value;try{const d=await api('/api/games/'+code()+'/config',{method:'POST',body:JSON.stringify({hostId:player(),hunterSelection:chosen,hunterIds:[]})});render(d.game);window.toast?.(chosen==='admin'?'Choose your hunters below':'Hunters will be selected randomly')}catch(e){window.toast?.(e.message)}}}
    mode.value=latest?.rules?.hunterSelection==='admin'?'admin':'random';
    let picker=document.querySelector('#hunterPicker');
    if(!picker){picker=document.createElement('div');picker.id='hunterPicker';picker.className='hunter-picker';mode.closest('.adminfield').after(picker)}
    const adminMode=mode.value==='admin';picker.style.display=adminMode?'block':'none';
    if(adminMode){const count=Number(latest?.rules?.hunterCount)||1;const selected=new Set(latest?.rules?.hunterIds||[]);picker.innerHTML='<label>SELECT '+count+' HUNTER'+(count===1?'':'S')+'</label><div class="hunter-options">'+latest.players.map(p=>'<label class="hunter-option"><input type="checkbox" value="'+esc(p.id)+'" '+(selected.has(p.id)?'checked':'')+'><span>'+esc(p.name)+'</span></label>').join('')+'</div><small class="hunter-help">Select exactly '+count+' player'+(count===1?'':'s')+' before starting.</small>';
      picker.querySelectorAll('input').forEach(input=>input.onchange=async()=>{const ids=[...picker.querySelectorAll('input:checked')].map(x=>x.value);try{await api('/api/games/'+code()+'/config',{method:'POST',body:JSON.stringify({hostId:player(),hunterIds:ids})});window.toast?.(ids.length===count?'Hunter lineup saved':`Select ${count} hunter${count===1?'':'s'}`)}catch(e){window.toast?.(e.message)}})
    }
  }
  function render(g){
    latest=g;wireReady();wireModeDescriptions();const id=player(),isHost=id===g.hostId,allReady=g.players.length>=2&&g.players.every(p=>p.ready);
    const list=document.querySelector('.players');if(list)list.innerHTML=g.players.map(p=>'<div class="player"><div>'+esc(p.name)+'<small>'+(p.ready?'ready':'waiting')+' · location '+(p.locationShared?'on':'off')+'</small></div><span class="role">'+(p.role==='UNASSIGNED'?'WAITING':esc(p.role))+'</span></div>').join('');
    ['adminCard','mapCard','videoRules'].forEach(id=>{const el=document.getElementById(id)||document.querySelector('.'+id);if(el)el.style.display=isHost?'block':'none'});
    const start=document.querySelector('#startBtn');if(start){start.style.display=isHost&&g.status==='lobby'?'block':'none';start.disabled=!allReady;start.textContent=allReady?'Start game':'Waiting for Ready';}
    const ready=document.querySelector('#readyBtn'),me=g.players.find(p=>p.id===id);if(ready&&me){ready.dataset.ready=String(!!me.ready);ready.textContent=me.ready?'Ready ✓':'Tap Ready';}
    const gameRole=document.querySelector('#game .role');if(gameRole&&me&&g.status==='live')gameRole.textContent='YOU: '+(me.role==='HUNTER'?'HUNTER':'RUNNER');
    if(g.status==='live'&&me?.status!=='tagged'&&!window.huntLocationAsked){window.huntLocationAsked=true;window.huntRequestLocation?.();}wireHunterSetting(isHost);wireAdminTiming(isHost);if(isHost){wireMap();centerFromTypedArea(g.area)}ensureLiveMap(g);
    const pill=document.querySelector('#game .modepill');if(pill)pill.textContent=String(g.mode||'Classic').toUpperCase()+' · '+String(g.duration||'45 minutes').toUpperCase();
    const notice=document.querySelector('#game .notice');if(notice){if(me?.status==='tagged')notice.textContent="You've been caught, return to the start and enjoy the show";else if(g.status==='live'&&g.rules?.autoPing!==false&&g.nextPingSeconds!=null)notice.innerHTML='<b id="nextPingCountdown">Next ping in '+clock(g.nextPingSeconds)+'</b><br>'+((me?.role==='HUNTER')?'Runner positions stay hidden between waves. Move safely and keep your surroundings in view.':'Stay aware — the next runner ping is coming soon. Keep your surroundings in view.');}
    ensureLoading(g);checkBoundary(g);if(g.status==='live'&&g.pingWave>seenPing){if(seenPing>=0&&g.rules?.pingSound!==false)ding();seenPing=g.pingWave}
    latestSyncedAt=Date.now();updateTimer();
    if(!timerHandle)timerHandle=setInterval(updateTimer,1000);
  }
  window.huntRenderOnline=render;
  async function sync(){const c=code();if(!c)return;try{const d=await api('/api/games/'+c+'?playerId='+encodeURIComponent(player()||''));render(d.game)}catch(_){} }
  setInterval(sync,1000);setTimeout(sync,250);
})();

