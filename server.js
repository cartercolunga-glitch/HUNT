// HUNT multiplayer prototype server.
// Run with: node server.js
// Then open http://localhost:8787 on the host device and share that address on the same network.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const games = new Map();
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.css':'text/css','.b64':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};

function code(){return crypto.randomBytes(3).toString('hex').toUpperCase()}
function id(){return crypto.randomUUID()}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})})}
function secondsFrom(value){const m=String(value||'').match(/(\d+(?:\.\d+)?)\s*(second|minute|hour)/i);if(!m)return 0;const n=Number(m[1]);return m[2].toLowerCase().startsWith('hour')?n*3600:m[2].toLowerCase().startsWith('minute')?n*60:n}
function emitPing(game){game.pingWave+=1;game.lastPingAt=Date.now();game.pingSnapshot={};for(const p of game.players)if(p.role==='RUNNER'&&game.locations[p.id]&&(game.rules.requireLocationSharing===false||p.locationShared))game.pingSnapshot[p.id]=game.locations[p.id]}
function advanceGame(game){if(game.status!=='live')return;const duration=secondsFrom(game.duration);const elapsed=Math.max(0,Math.floor((Date.now()-game.startedAt)/1000));game.remainingSeconds=Math.max(0,duration-elapsed);if(game.rules.autoEnd!==false&&duration&&game.remainingSeconds<=0){game.status='complete';return}const pingSeconds=secondsFrom(game.rules.pingInterval);if(game.rules.autoPing!==false&&pingSeconds>0&&(!game.lastPingAt||Date.now()-game.lastPingAt>=pingSeconds*1000))emitPing(game)}
function safe(game,viewerId){advanceGame(game);const viewer=game.players.find(p=>p.id===viewerId);const hunter=viewer?.role==='HUNTER'&&game.status==='live';const caught=viewer?.status==='tagged';const visible={};if(hunter||caught){Object.assign(visible,game.locations)}else if(viewer?.role==='RUNNER'&&game.status==='live'&&game.rules.runnerMap!==false){for(const p of game.players)if(p.role==='RUNNER'&&game.locations[p.id])visible[p.id]=game.locations[p.id]}else if(viewerId&&game.locations[viewerId])visible[viewerId]=game.locations[viewerId];return {...game,players:game.players.map(p=>({...p})),locations:visible,pingSnapshot:hunter?{...(game.pingSnapshot||{})}:{} }}
function getGame(req){const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);return games.get(parts[2]?.toUpperCase())}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/api/games'&&req.method==='POST'){
      const b=await body(req);let gameCode=code();while(games.has(gameCode))gameCode=code();
      const host={id:id(),name:b.hostName||'Host',role:'UNASSIGNED',ready:false,status:'waiting',locationShared:false};
      const game={code:gameCode,name:b.name||'Outdoor Hunt',area:b.area||'Agreed play area',duration:b.duration||'45 minutes',mode:b.mode||'Classic',status:'lobby',pingWave:0,createdAt:Date.now(),startedAt:null,players:[host],hostId:host.id,zone:b.zone||{type:'circle',radius:500},rules:{tagRange:b.tagRange||'1 m',headStart:b.headStart||'2 minutes',pingInterval:b.pingInterval||'5 minutes',autoPing:b.autoPing!==false,pingSound:b.pingSound!==false,requireLocationSharing:b.requireLocationSharing!==false,runnerMap:b.runnerMap!==false,maxPlayers:Number(b.maxPlayers)||20,hunterCount:Math.max(1,Number(b.hunterCount)||1),locationPrecision:b.locationPrecision||'Approximate',connectionMode:b.connectionMode||'internet',chatEnabled:b.chatEnabled!==false,autoEnd:b.autoEnd!==false},messages:[],locations:{},pingSnapshot:{}};games.set(gameCode,game);return send(res,201,{game:safe(game,host.id),playerId:host.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+\/join$/)&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});if(game.players.length>=game.rules.maxPlayers)return send(res,409,{error:'This game is full'});const b=await body(req);const player={id:id(),name:b.name||'Player',role:'UNASSIGNED',ready:false,status:'waiting',locationShared:false};game.players.push(player);return send(res,201,{game:safe(game,player.id),playerId:player.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+$/)&&req.method==='GET'){const game=getGame(req);return game?send(res,200,{game:safe(game,url.searchParams.get('playerId'))}):send(res,404,{error:'Game not found'})}
    const action=url.pathname.match(/^\/api\/games\/([^/]+)\/(start|ready|ping|tag|stop|location|chat|zone|config)$/);
    if(action&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});const b=await body(req);
      if(['start','ping','stop','zone','config'].includes(action[2])&&b.hostId!==game.hostId)return send(res,403,{error:'Only the host can control this game'});
      if(action[2]==='ready'){const p=game.players.find(x=>x.id===b.playerId);if(!p)return send(res,404,{error:'Player not found'});p.ready=b.ready!==false;p.status=p.ready?'ready':'waiting'}
      if(action[2]==='start'){if(game.players.length<2)return send(res,409,{error:'At least two players are required'});if(!game.players.every(p=>p.ready))return send(res,409,{error:'Everyone must tap Ready first'});const shuffled=[...game.players].sort(()=>Math.random()-0.5);const hunterCount=Math.max(1,Math.min(game.players.length-1,Number(game.rules.hunterCount)||1));game.players.forEach(p=>{p.role='RUNNER'});shuffled.slice(0,hunterCount).forEach(p=>{p.role='HUNTER'});game.status='live';game.startedAt=Date.now();game.remainingSeconds=secondsFrom(game.duration);game.lastPingAt=Date.now()}
      if(action[2]==='ping')emitPing(game)
      if(action[2]==='tag'){const p=game.players.find(x=>x.id===b.playerId);if(p){p.status='tagged';p.taggedAt=Date.now()}}
      if(action[2]==='location'){if(b.playerId&&b.latitude!=null&&b.longitude!=null){const p=game.players.find(x=>x.id===b.playerId);if(p?.status!=='tagged'){game.locations[b.playerId]={latitude:b.latitude,longitude:b.longitude,accuracy:b.accuracy||null,updatedAt:Date.now()};if(p)p.locationShared=true}}}
      if(action[2]==='chat'&&b.playerId&&b.text){const p=game.players.find(x=>x.id===b.playerId);game.messages.push({id:id(),playerId:b.playerId,name:p?.name||'Player',text:String(b.text).slice(0,240),createdAt:Date.now()});game.messages=game.messages.slice(-100)}
      if(action[2]==='zone'&&b.zone)game.zone=b.zone;
      if(action[2]==='config'){if(b.hostId!==game.hostId)return send(res,403,{error:'Only the host can change settings'});if(b.duration)game.duration=String(b.duration);if(b.mode)game.mode=String(b.mode);const allowed=['tagRange','headStart','pingInterval','autoPing','pingSound','requireLocationSharing','runnerMap','maxPlayers','hunterCount','locationPrecision','connectionMode','seekerMethod','caughtBehavior','playerRole','scheduleStart','chatEnabled','autoEnd'];for(const key of allowed)if(b[key]!==undefined)game.rules[key]=key==='maxPlayers'?Math.max(game.players.length,Math.min(100,Number(b[key]))):key==='hunterCount'?Math.max(1,Math.min(50,Number(b[key]))):b[key]}
      if(action[2]==='stop')game.status='complete';return send(res,200,{game:safe(game,b.playerId||b.hostId)})
    }
    if(req.method==='GET'){
      const file=url.pathname==='/'?'/index.html':url.pathname;const full=path.join(ROOT,path.normalize(file));if(!full.startsWith(ROOT))return send(res,403,{error:'Forbidden'});if(url.pathname==='/hunt-forest-bg.jpg'){fs.readFile(path.join(ROOT,'hunt-forest-bg.b64'),'utf8',(e,encoded)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000'});res.end(Buffer.from(encoded.trim(),'base64'))});return}fs.readFile(full,(e,data)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});res.end(data)})
      return
    }
    send(res,404,{error:'Not found'})
  }catch(e){send(res,500,{error:e.message})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`HUNT server running at http://localhost:${PORT}`));


