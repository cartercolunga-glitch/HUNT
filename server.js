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
function safe(game){return {...game,players:game.players.map(p=>({...p}))}}
function getGame(req){const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);return games.get(parts[2]?.toUpperCase())}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/api/games'&&req.method==='POST'){
      const b=await body(req);let gameCode=code();while(games.has(gameCode))gameCode=code();
      const host={id:id(),name:b.hostName||'Host',role:'HUNTER',status:'ready',locationShared:false};
      const game={code:gameCode,name:b.name||'Outdoor Hunt',area:b.area||'Agreed play area',duration:b.duration||'45 minutes',mode:b.mode||'Classic',status:'lobby',pingWave:0,createdAt:Date.now(),startedAt:null,players:[host],hostId:host.id,zone:b.zone||{type:'circle',radius:500},rules:{tagRange:b.tagRange||'1 m',headStart:b.headStart||'2 minutes',pingInterval:b.pingInterval||'5 minutes',maxPlayers:Number(b.maxPlayers)||20,locationPrecision:b.locationPrecision||'Approximate',connectionMode:b.connectionMode||'internet',chatEnabled:b.chatEnabled!==false,autoEnd:b.autoEnd!==false},messages:[],locations:{}};games.set(gameCode,game);return send(res,201,{game:safe(game),playerId:host.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+\/join$/)&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});if(game.players.length>=game.rules.maxPlayers)return send(res,409,{error:'This game is full'});const b=await body(req);const player={id:id(),name:b.name||'Player',role:game.players.filter(p=>p.role==='RUNNER').length<game.players.filter(p=>p.role==='HUNTER').length?'RUNNER':'HUNTER',status:'ready',locationShared:false};game.players.push(player);return send(res,201,{game:safe(game),playerId:player.id})
    }
    if(url.pathname.match(/^\/api\/games\/[^/]+$/)&&req.method==='GET'){const game=getGame(req);return game?send(res,200,{game:safe(game)}):send(res,404,{error:'Game not found'})}
    const action=url.pathname.match(/^\/api\/games\/([^/]+)\/(start|ping|tag|stop|location|chat|zone|config)$/);
    if(action&&req.method==='POST'){
      const game=getGame(req);if(!game)return send(res,404,{error:'Game not found'});const b=await body(req);
      if(['start','ping','stop','zone','config'].includes(action[2])&&b.hostId!==game.hostId)return send(res,403,{error:'Only the host can control this game'});
      if(action[2]==='start'){game.status='live';game.startedAt=Date.now()}
      if(action[2]==='ping'){game.pingWave+=1;game.lastPingAt=Date.now()}
      if(action[2]==='tag'){const p=game.players.find(x=>x.id===b.playerId);if(p){p.status='tagged';p.taggedAt=Date.now()}}
      if(action[2]==='location'){if(b.playerId&&b.latitude!=null&&b.longitude!=null)game.locations[b.playerId]={latitude:b.latitude,longitude:b.longitude,accuracy:b.accuracy||null,updatedAt:Date.now()}}
      if(action[2]==='chat'&&b.playerId&&b.text){const p=game.players.find(x=>x.id===b.playerId);game.messages.push({id:id(),playerId:b.playerId,name:p?.name||'Player',text:String(b.text).slice(0,240),createdAt:Date.now()});game.messages=game.messages.slice(-100)}
      if(action[2]==='zone'&&b.zone)game.zone=b.zone;
      if(action[2]==='config'){if(b.hostId!==game.hostId)return send(res,403,{error:'Only the host can change settings'});if(b.duration)game.duration=String(b.duration);if(b.mode)game.mode=String(b.mode);const allowed=['tagRange','headStart','pingInterval','maxPlayers','locationPrecision','connectionMode','seekerMethod','caughtBehavior','playerRole','scheduleStart','chatEnabled','autoEnd'];for(const key of allowed)if(b[key]!==undefined)game.rules[key]=key==='maxPlayers'?Math.max(game.players.length,Math.min(100,Number(b[key]))):b[key]}
      if(action[2]==='stop')game.status='complete';return send(res,200,{game:safe(game)})
    }
    if(req.method==='GET'){
      const file=url.pathname==='/'?'/index.html':url.pathname;const full=path.join(ROOT,path.normalize(file));if(!full.startsWith(ROOT))return send(res,403,{error:'Forbidden'});if(url.pathname==='/hunt-forest-bg.jpg'){fs.readFile(path.join(ROOT,'hunt-forest-bg.b64'),'utf8',(e,encoded)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000'});res.end(Buffer.from(encoded.trim(),'base64'))});return}fs.readFile(full,(e,data)=>{if(e)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});res.end(data)})
      return
    }
    send(res,404,{error:'Not found'})
  }catch(e){send(res,500,{error:e.message})}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`HUNT server running at http://localhost:${PORT}`));

