// HUNT multiplayer prototype server.
// Run with: node server.js
// Then open http://localhost:8787 on the host device and share that address on the same network.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const games = new Map();
const DATA_FILE = process.env.HUNT_DATA_FILE || path.join(ROOT,'data','games.json');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.css':'text/css','.b64':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};

function code(){return String(Math.floor(1000+Math.random()*9000))}
function id(){return crypto.randomUUID()}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})})}
function saveGames(){try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE,JSON.stringify([...games.entries()]),'utf8')}catch(e){console.warn('Persistence unavailable:',e.message)}}
function loadGames(){try{if(!fs.existsSync(DATA_FILE))return;const saved=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));for(const [key,value] of saved)if(value?.code)games.set(key,value);console.log(`Restored ${games.size} game(s)`)}catch(e){console.warn('Could not restore saved games:',e.message)}}
const sockets=new Map();
function broadcast(game){const room=sockets.get(game.code);if(!room)return;for(const [socket,viewerId] of room){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({game:safe(game,viewerId)}))}}
function secondsFrom(value){const m=String(value||'').match(/(\d+(?:\.\d+)?)\s*(second|minute|hour)/i);if(!m)return 0;const n=Number(m[1]);return m[2].toLowerCase().startsWith('hour')?n*3600:m[2].toLowerCase().startsWith('minute')?n*60:n}
function distanceMeters(a,b){if(!a||!b)return Infinity;const rad=Math.PI/180,lat1=Number(a.latitude)*rad,lat2=Number(b.latitude)*rad,dLat=(Number(b.latitude)-Number(a.latitude))*rad,dLng=(Number(b.longitude)-Number(a.longitude))*rad;const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function locationFor(game, point){
  if(!point)return null;
  const mode=game.rules.locationMode||'approximate';
  if(mode==='none')return null;
  if(mode==='exact')return {...point};
  // Approximate mode intentionally rounds to roughly 100m grids.
  return {...point,latitude:Number(Number(point.latitude).toFixed(3)),longitude:Number(Number(point.longitude).toFixed(3)),accuracy:Math.max(Number(point.accuracy)||0,100)};
}
function emitPing(game){
  if(game.mode==='Blackout')return false;
  game.pingWave+=1;game.lastPingAt=Date.now();game.pingSnapshot={};
  for(const p of game.players){
    const eligible=game.mode==='Senior Assassin'?p.id===p.targetId:p.role==='RUNNER';
    if(eligible&&game.locations[p.id]&&(game.rules.requireLocationSharing===false||p.locationShared)){const point=locationFor(game,game.locations[p.id]);if(point)game.pingSnapshot[p.id]=point}
  }
  if(game.mode==='Closing net')scheduleClosingShrink(game);
  return true;
}
function applyClosingShrink(game){
  const zone=game.zone||{};const stages=Number(game.rules.closingStages)||5;const stage=Math.min(stages,Number(game.zoneStage||0)+1);game.zoneStage=stage;
  const factor=Math.max(.18,1-(stage/stages)*.72);
  if(zone.type==='circle'&&Number(zone.radius)){game.zone={...zone,radius:Math.max(40,Math.round(zone.radius*factor)),stage};}
  else if(zone.type==='polygon'&&Array.isArray(zone.points)&&zone.points.length>=3){
    const lat=zone.points.reduce((a,p)=>a+Number(p[0]),0)/zone.points.length, lng=zone.points.reduce((a,p)=>a+Number(p[1]),0)/zone.points.length;
    game.zone={...zone,points:zone.points.map(p=>[lat+(Number(p[0])-lat)*factor,lng+(Number(p[1])-lng)*factor]),stage};
  } else game.zone={...zone,stage};
  game.upcomingZone=null;game.zoneShrinkAt=null;game.zoneWarningUntil=null;
}
function scheduleClosingShrink(game){
  const zone=game.zone||{};const stages=Number(game.rules.closingStages)||5;const stage=Math.min(stages,Number(game.zoneStage||0)+1);
  const factor=Math.max(.18,1-(stage/stages)*.72);let upcoming={...zone,stage};
  if(zone.type==='circle'&&Number(zone.radius))upcoming={...zone,radius:Math.max(40,Math.round(zone.radius*factor)),stage};
  else if(zone.type==='polygon'&&Array.isArray(zone.points)&&zone.points.length>=3){const lat=zone.points.reduce((a,p)=>a+Number(p[0]),0)/zone.points.length,lng=zone.points.reduce((a,p)=>a+Number(p[1]),0)/zone.points.length;upcoming={...zone,points:zone.points.map(p=>[lat+(Number(p[0])-lat)*factor,lng+(Number(p[1])-lng)*factor]),stage};}
  const warning=secondsFrom(game.rules.zoneWarning)||10;const shrink=secondsFrom(game.rules.shrinkDuration)||20;game.upcomingZone=upcoming;game.zoneWarningUntil=Date.now()+warning*1000;game.zoneShrinkAt=Date.now()+(warning+shrink)*1000;
}
function assignAssassinTargets(game){
  const eligible=game.players.filter(p=>p.status!=='tagged');
  if(eligible.length<2)return;
  const shuffled=[...eligible].sort(()=>Math.random()-.5);
  eligible.forEach((p,i)=>{p.targetId=shuffled[(i+1)%shuffled.length].id;p.eliminations=0;p.status='ready'});
  game.assassinSystem=game.rules.assassinSystem||'continuous';game.assassinFormat=game.rules.assassinFormat||'solos';
}
function finishGame(game,reason='timer'){game.status='complete';game.completedAt=Date.now();game.endReason=reason;game.remainingSeconds=0;game.nextPingSeconds=null;const runners=game.players.filter(p=>p.role==='RUNNER');const caught=runners.filter(p=>p.status==='tagged'||(game.mode==='Freeze tag'&&p.status==='frozen'));const allFrozen=game.mode==='Freeze tag'&&game.rules.allFrozenWins&&runners.length&&runners.every(p=>p.status==='frozen'||p.status==='tagged');const remainingAssassins=game.mode==='Senior Assassin'?game.players.filter(p=>p.status!=='tagged'):[];const assassinWinner=game.mode==='Senior Assassin'?(game.rules.assassinWinCondition==='Most eliminations'?[...game.players].sort((a,b)=>(b.eliminations||0)-(a.eliminations||0))[0]?.name:remainingAssassins[0]?.name):null;game.result={name:game.name,area:game.area,duration:game.duration,mode:game.mode,winner:game.mode==='Senior Assassin'?(assassinWinner||'No winner'):(allFrozen||runners.length&&caught.length===runners.length)?'HUNTERS':'RUNNERS',players:game.players.length,hunters:game.players.filter(p=>p.role==='HUNTER'||p.role==='ASSASSIN').length,runners:runners.length,caughtRunners:caught.length,tagsConfirmed:caught.length,safetyStops:reason==='safety'?1:0,reason};return game.result}
function advanceGame(game){if(game.status==='starting'){if(Date.now()<game.launchAt)return;game.status='live';game.startedAt=game.launchAt;game.lastPingAt=game.launchAt;game.remainingSeconds=secondsFrom(game.duration)}if(game.status!=='live')return;const duration=secondsFrom(game.duration);const elapsed=Math.max(0,Math.floor((Date.now()-game.startedAt)/1000));game.remainingSeconds=Math.max(0,duration-elapsed);if(game.mode==='Closing net'&&game.zoneShrinkAt&&Date.now()>=game.zoneShrinkAt)applyClosingShrink(game);if(game.mode==='Senior Assassin'&&game.players.filter(p=>p.status!=='tagged').length<=1){finishGame(game,'elimination');return}if(game.rules.autoEnd!==false&&duration&&game.remainingSeconds<=0){finishGame(game,'timer');return}const pingSeconds=secondsFrom(game.rules.pingInterval);const scheduled=game.mode!=='Blackout'&&game.rules.autoPing!==false&&pingSeconds>0;if(scheduled&&(!game.lastPingAt||Date.now()-game.lastPingAt>=pingSeconds*1000))emitPing(game);game.nextPingSeconds=scheduled&&game.lastPingAt?Math.max(0,Math.ceil((game.lastPingAt+pingSeconds*1000-Date.now())/1000)):null}
function safe(game,viewerId){
  advanceGame(game);const viewer=game.players.find(p=>p.id===viewerId);const hunter=viewer?.role==='HUNTER'&&game.status==='live';const caught=viewer?.status==='tagged';const visible={};
  const add=(pid,point)=>{const safePoint=locationFor(game,point);if(safePoint)visible[pid]=safePoint};
  if(game.mode==='Blackout'){
    for(const p of game.players)if(p.role==='HUNTER'&&game.locations[p.id])add(p.id,game.locations[p.id]);
    if(viewer?.role==='RUNNER'&&game.rules.runnerMap!==false)for(const p of game.players)if(p.role==='RUNNER'&&game.locations[p.id])add(p.id,game.locations[p.id]);
  } else if(game.mode==='Senior Assassin'){
    if(viewerId&&game.locations[viewerId])add(viewerId,game.locations[viewerId]);
    const target=viewer?.targetId&&game.pingSnapshot?.[viewer.targetId];if(target)add(viewer.targetId,target);
  } else if(hunter||caught)for(const [pid,point] of Object.entries(game.locations))add(pid,point);
  else if(viewer?.role==='RUNNER'&&game.status==='live'&&game.rules.runnerMap!==false)for(const p of game.players)if(p.role==='RUNNER'&&game.locations[p.id])add(p.id,game.locations[p.id]);
  else if(viewerId&&game.locations[viewerId])add(viewerId,game.locations[viewerId]);
  const rules={...game.rules};if(viewerId!==game.hostId&&game.status==='lobby')delete rules.hunterIds;
  if(game.mode==='Blackout')rules.autoPing=false;
  if(game.mode==='Senior Assassin'){delete rules.hunterIds;delete rules.hunterCount;rules.assassinSystem=game.assassinSystem||rules.assassinSystem||'continuous';rules.assassinFormat=game.assassinFormat||rules.assassinFormat||'solos'}
  const live=game.status==='live'||game.status==='starting';
  const photosEnabled=rules.photoIdentification!==false;
  const players=game.players.map(p=>{const copy={...p};delete copy.photo;delete copy.targetId;if(game.mode==='Senior Assassin'&&p.id===viewerId&&p.targetId){copy.targetId=p.targetId;copy.targetName=game.players.find(x=>x.id===p.targetId)?.name||null}const opposing=(viewer?.role==='HUNTER'&&p.role==='RUNNER')||(viewer?.role==='RUNNER'&&p.role==='HUNTER')||(game.mode==='Senior Assassin'&&viewer?.targetId===p.id)||caught;if(live&&photosEnabled&&viewer&&viewerId!==p.id&&p.photo&&opposing)copy.photo=p.photo;copy.hasPhoto=!!p.photo;return copy});
  const pingSnapshot=game.mode==='Senior Assassin'&&viewerId?Object.fromEntries(Object.entries(game.pingSnapshot||{}).filter(([pid])=>pid===viewerId).map(([pid,point])=>[pid,locationFor(game,point)]).filter(([,point])=>point)):hunter?Object.fromEntries(Object.entries(game.pingSnapshot||{}).map(([pid,point])=>[pid,locationFor(game,point)]).filter(([,point])=>point)):{};
  return {...game,rules,players,locations:visible,pingSnapshot,nextPingSeconds:game.status==='live'?game.nextPingSeconds:null,result:game.result||null};
}
function getGame(req){const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);return games.get(parts[2]?.toUpperCase())}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'HUNT',games:games.size,now:Date.now()});
    if(url.pathname==='/api/games'&&req.method==='POST'){
      const b=await body(req);if(!String(b.hostName||'').trim())return send(res,400,{error:'Host name is required'});let gameCode=code();while(games.has(gameCode))gameCode=code();
      const host={id:id(),name:b.hostName||'Host',role:'UNASSIGNED',ready:false,status:'waiting',locationShared:false};
      const game={code:gameCode,name:b.name||'Outdoor Hunt',area:b.area||'Agreed play area',duration:b.duration||'45 minutes',mode:b.mode||'Classic',status:'lobby',pingWave:0,createdAt:Date.now(),startedAt:null,players:[host],hostId:host.id,zone:b.zone||{type:'circle',radius:500},rules:{tagRange:b.tagRange||'1 m',headStart:b.headStart||'2 minutes',pingInterval:b.pingInterval||'5 minutes',autoPing:b.autoPing!==false,pingSound:b.pingSound!==false,requireLocationSharing:b.requireLocationSharing!==false,runnerMap:b.runnerMap!==false,maxPlayers:Number(b.maxPlayers)||20,hunterCount:Math.max(1,Number(b.hunterCount)||1),hunterSelection:b.hunterSelection==='admin'?'admin':'random',hunterIds:Array.isArray(b.hunterIds)?b.hunterIds:[],locationPrecision:b.locationPrecision||'Approximate',locationMode:b.locationMode||'approximate',photoIdentification:b.photoIdentification!==false,connectionMode:b.connectionMode||'internet',chatEnabled:b.chatEnabled!==false,autoEnd:b.autoEnd!==false,thawDuration:b.thawDuration||'10 seconds',thawRadius:b.thawRadius||'3 m',allFrozenWins:b.allFrozenWins===true,closingStages:Number(b.closingStages)||5,zoneWarning:b.zoneWarning||'10 seconds',shrinkDuration:b.shrinkDuration||'20 seconds',outsideGrace:b.outsideGrace||'10 seconds',blackoutScanCooldown:b.blackoutScanCooldown||'5 minutes',clueDuration:b.clueDuration||'30 seconds',assassinFormat:b.assassinFormat||'solos',assassinSystem:b.assassinSystem||'continuous',assassinWinCondition:b.assassinWinCondition||'last standing'},messages:[],locations:{},pingSnapshot:{},result:null};const initialRuleKeys=['tagRange','headStart','pingInterval','autoPing','pingSound','requireLocationSharing','runnerMap','maxPlayers','hunterCount','hunterSelection','hunterIds','locationPrecision','locationMode','photoIdentification','connectionMode','chatEnabled','autoEnd','playerRole','thawDuration','thawRadius','allFrozenWins','closingStages','zoneWarning','shrinkDuration','outsideGrace','blackoutScanCooldown','clueDuration','assassinFormat','assassinSystem','assassinWinCondition'];for(const key of initialRuleKeys)if(b[key]!==undefined)game.rules[key]=key==='maxPlayers'?Math.max(game.players.length,Math.min(100,Number(b[key]))):key==='hunterCount'?Math.max(1,Math.min(50,Number(b[key]))):key==='hunterIds'?Array.isArray(b[key])?b[key].filter(id=>game.players.some(p=>p.id===id)):[]:b[key];games.set(gameCode,game);saveGames();return send(res,201,{game:safe(game,host.id),playerId:host.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+\/join$/)&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});if(game.status!=='lobby')return send(res,409,{error:'This game has already started'});if(game.players.length>=game.rules.maxPlayers)return send(res,409,{error:'This game is full'});const b=await body(req);const player={id:id(),name:b.name||'Player',role:'UNASSIGNED',ready:false,status:'waiting',locationShared:false};game.players.push(player);saveGames();broadcast(game);return send(res,201,{game:safe(game,player.id),playerId:player.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+$/)&&req.method==='GET'){const game=getGame(req);return game?send(res,200,{game:safe(game,url.searchParams.get('playerId'))}):send(res,404,{error:'Game not found'})}
    const action=url.pathname.match(/^\/api\/games\/([^/]+)\/(start|ready|ping|tag|thaw|stop|leave|location|photo|chat|zone|config)$/);
    if(action&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});const b=await body(req);
      if(['start','ping','stop','leave','zone','config'].includes(action[2])&&b.hostId!==game.hostId)return send(res,403,{error:'Only the host can control this game'});
      if(action[2]==='ready'){const p=game.players.find(x=>x.id===b.playerId);if(!p)return send(res,404,{error:'Player not found'});p.ready=b.ready!==false;p.status=p.ready?'ready':'waiting'}
      if(action[2]==='start'){if(game.players.length<2)return send(res,409,{error:'At least two players are required'});if(!game.players.every(p=>p.ready))return send(res,409,{error:'Everyone must tap Ready first'});const hunterCount=Math.max(1,Math.min(game.players.length-1,Number(game.rules.hunterCount)||1));let chosen=[];if(game.rules.hunterSelection==='admin'){chosen=(Array.isArray(game.rules.hunterIds)?game.rules.hunterIds:[]).filter(id=>game.players.some(p=>p.id===id));if(chosen.length!==hunterCount)return send(res,409,{error:`Select exactly ${hunterCount} hunter${hunterCount===1?'':'s'} before starting`})}else{chosen=[...game.players].sort(()=>Math.random()-0.5).slice(0,hunterCount).map(p=>p.id)}game.players.forEach(p=>{p.role=chosen.includes(p.id)?'HUNTER':'RUNNER'});if(game.mode==='Senior Assassin'){game.players.forEach(p=>p.role='ASSASSIN');assignAssassinTargets(game)}game.status='starting';game.startedAt=null;const headStart=secondsFrom(game.rules.headStart);game.headStartSeconds=headStart;game.launchDelayMs=5000+Math.floor(Math.random()*5001)+headStart*1000;game.launchAt=Date.now()+game.launchDelayMs;game.launchImage='hunt-loading-'+Math.floor(Math.random()*9)+'.jpg';game.remainingSeconds=secondsFrom(game.duration);game.lastPingAt=null}
      if(action[2]==='ping'){if(game.mode==='Blackout')return send(res,409,{error:'Blackout has no scheduled or manual ping waves'});emitPing(game)}
      if(action[2]==='tag'){const actor=game.players.find(x=>x.id===b.playerId);if(!actor)return send(res,404,{error:'Player not found'});if(game.mode==='Freeze tag'){const target=game.players.find(x=>x.id===b.targetId);if(actor.role!=='HUNTER'||!target||target.role!=='RUNNER'||target.status==='tagged'||target.status==='frozen')return send(res,409,{error:'Select an active runner to freeze'});target.status='frozen';target.frozenAt=Date.now();target.frozenBy=actor.id;target.thawProgress=0}else if(game.mode==='Senior Assassin'){const target=game.players.find(x=>x.id===b.targetId)||game.players.find(x=>x.id===actor.targetId);if(actor.role!=='ASSASSIN'||actor.targetId!==target?.id||target.status==='tagged')return send(res,409,{error:'That is not your assigned target'});target.status='tagged';target.taggedAt=Date.now();actor.eliminations=(actor.eliminations||0)+1;if(game.rules.assassinSystem!=='round'){const remaining=game.players.filter(x=>x.status!=='tagged'&&x.id!==actor.id);actor.targetId=remaining.find(x=>x.id!==actor.id)?.id||null}}else{actor.status='tagged';actor.taggedAt=Date.now()}}
      if(action[2]==='thaw'){if(game.mode!=='Freeze tag')return send(res,409,{error:'Thawing is only available in Freeze Tag'});const frozen=game.players.find(x=>x.id===b.targetId),rescuer=game.players.find(x=>x.id===b.playerId);if(!frozen||!rescuer||frozen.status!=='frozen'||rescuer.role!=='RUNNER'||rescuer.status==='frozen'||rescuer.id===frozen.id)return send(res,409,{error:'Invalid thaw attempt'});const frozenPoint=game.locations[frozen.id],rescuerPoint=game.locations[rescuer.id],radius=Number.parseFloat(String(game.rules.thawRadius||'3'))||3;if(distanceMeters(frozenPoint,rescuerPoint)>radius)return send(res,409,{error:`Move within ${radius} m to thaw this runner`});const required=secondsFrom(game.rules.thawDuration)||10;if(!frozen.thawStartedAt){frozen.thawStartedAt=Date.now();frozen.thawProgress=0;saveGames();broadcast(game);return send(res,202,{game:safe(game,b.playerId),message:'Thaw started'})}frozen.thawProgress=Math.min(100,Math.round((Date.now()-frozen.thawStartedAt)/(required*1000)*100));if(frozen.thawProgress<100)return send(res,202,{game:safe(game,b.playerId),message:`Thaw ${frozen.thawProgress}% complete`});frozen.status='waiting';frozen.thawedAt=Date.now();frozen.thawProgress=100;frozen.thawStartedAt=null;frozen.protectedUntil=Date.now()+5000;}
      if(action[2]==='location'){if(b.playerId&&b.latitude!=null&&b.longitude!=null){const p=game.players.find(x=>x.id===b.playerId);if(p?.status!=='tagged'&&p?.status!=='frozen'){game.locations[b.playerId]={latitude:b.latitude,longitude:b.longitude,accuracy:b.accuracy||null,updatedAt:Date.now()};if(p)p.locationShared=true}}}
      if(action[2]==='photo'){const p=game.players.find(x=>x.id===b.playerId);const photo=String(b.photo||'');if(!p)return send(res,404,{error:'Player not found'});if(photo&&(!/^data:image\/(jpeg|png|webp);base64,/.test(photo)||photo.length>300000))return send(res,400,{error:'Photo must be a compressed image under 220 KB'});p.photo=photo||null}
      if(action[2]==='chat'&&b.playerId&&b.text){const p=game.players.find(x=>x.id===b.playerId);game.messages.push({id:id(),playerId:b.playerId,name:p?.name||'Player',text:String(b.text).slice(0,240),createdAt:Date.now()});game.messages=game.messages.slice(-100)}
      if(action[2]==='zone'&&b.zone)game.zone=b.zone;
      if(action[2]==='config'){if(b.hostId!==game.hostId)return send(res,403,{error:'Only the host can change settings'});if(b.duration)game.duration=String(b.duration);if(b.mode)game.mode=String(b.mode);const allowed=['tagRange','headStart','pingInterval','autoPing','pingSound','requireLocationSharing','runnerMap','maxPlayers','hunterCount','hunterSelection','hunterIds','locationPrecision','locationMode','photoIdentification','connectionMode','seekerMethod','caughtBehavior','playerRole','scheduleStart','chatEnabled','autoEnd','thawDuration','thawRadius','allFrozenWins','closingStages','zoneWarning','shrinkDuration','outsideGrace','blackoutScanCooldown','clueDuration','assassinFormat','assassinSystem','assassinWinCondition'];for(const key of allowed)if(b[key]!==undefined)game.rules[key]=key==='maxPlayers'?Math.max(game.players.length,Math.min(100,Number(b[key]))):key==='hunterCount'?Math.max(1,Math.min(50,Number(b[key]))):key==='hunterIds'?Array.isArray(b[key])?b[key].filter(id=>game.players.some(p=>p.id===id)):[]:b[key]}
      if(action[2]==='stop'){finishGame(game,b.reason==='safety'?'safety':'host');saveGames();broadcast(game);return send(res,200,{game:safe(game,b.playerId||b.hostId)})}
      if(action[2]==='leave'){
        if(b.playerId===game.hostId){
          game.status='closed';game.endReason='host-left';game.closedAt=Date.now();
          saveGames();broadcast(game);
          setTimeout(()=>{if(games.get(game.code)===game)games.delete(game.code);saveGames()},250);
          return send(res,200,{game:safe(game,b.playerId)});
        }
        game.players=game.players.filter(p=>p.id!==b.playerId);delete game.locations[b.playerId];delete game.pingSnapshot[b.playerId];saveGames();broadcast(game);return send(res,200,{game:safe(game,b.playerId)});
      }
      saveGames();broadcast(game);
      return send(res,200,{game:safe(game,b.playerId||b.hostId)})
    }
    if(req.method==='GET'){
      const file=url.pathname==='/'?'/index.html':url.pathname;const full=path.join(ROOT,path.normalize(file));if(!full.startsWith(ROOT))return send(res,403,{error:'Forbidden'});if(url.pathname==='/hunt-forest-bg.jpg'){fs.readFile(path.join(ROOT,'hunt-forest-bg.b64'),'utf8',(e,encoded)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000'});res.end(Buffer.from(encoded.trim(),'base64'))});return}fs.readFile(full,(e,data)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});res.end(data)})
      return
    }
    send(res,404,{error:'Not found'})
  }catch(e){send(res,500,{error:e.message})}
});
loadGames();
server.listen(PORT,'0.0.0.0',()=>console.log(`HUNT server running at http://localhost:${PORT}`));
setInterval(()=>{for(const game of games.values()){advanceGame(game);broadcast(game)}saveGames()},1000);
process.on('SIGTERM',()=>{saveGames();server.close(()=>process.exit(0))});
process.on('SIGINT',()=>{saveGames();server.close(()=>process.exit(0))});

const wss=new WebSocket.Server({noServer:true});
server.on('upgrade',(req,socket,head)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname!=='/ws'){socket.destroy();return}const game=getGame(req);const viewerId=url.searchParams.get('playerId');if(!game||!viewerId){socket.destroy();return}wss.handleUpgrade(req,socket,head,client=>{wss.emit('connection',client,game,viewerId)})}catch(_){socket.destroy()}});
wss.on('connection',(socket,game,viewerId)=>{if(!sockets.has(game.code))sockets.set(game.code,new Map());sockets.get(game.code).set(socket,viewerId);socket.send(JSON.stringify({game:safe(game,viewerId)}));socket.on('close',()=>{const room=sockets.get(game.code);room?.delete(socket);if(room?.size===0)sockets.delete(game.code)})});


