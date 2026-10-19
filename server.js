'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters.'); process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL to a persistent PostgreSQL connection string (e.g. Neon).'); process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }, max: 5 });
const rooms = new Map();
const rate = new Map();
const MAX_BODY = 8 * 1024;

function json(res, status, obj) { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type,authorization', 'access-control-allow-methods':'GET,POST,OPTIONS' }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((resolve, reject) => { let data=''; req.on('data', c => { data += c; if (data.length > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad_json')); } }); req.on('error', reject); }); }
function b64(v) { return Buffer.from(JSON.stringify(v)).toString('base64url'); }
function makeToken(user) { const head = b64({alg:'HS256',typ:'JWT'}); const payload = b64({sub:String(user.id),username:user.username,exp:Math.floor(Date.now()/1000)+60*60*24*7}); const sig = crypto.createHmac('sha256',JWT_SECRET).update(head+'.'+payload).digest('base64url'); return head+'.'+payload+'.'+sig; }
function verifyToken(token) { try { const [h,p,s] = token.split('.'); const want=crypto.createHmac('sha256',JWT_SECRET).update(h+'.'+p).digest(); const got=Buffer.from(s,'base64url'); if (got.length!==want.length || !crypto.timingSafeEqual(got,want)) return null; const d=JSON.parse(Buffer.from(p,'base64url').toString()); if (!d.sub || d.exp < Date.now()/1000) return null; return d; } catch { return null; } }
function passwordHash(password, salt=crypto.randomBytes(16).toString('hex')) { return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve({salt,hash:key.toString('hex')}))); }
async function passwordMatches(password,salt,expected) { const out=await passwordHash(password,salt); const a=Buffer.from(out.hash,'hex'), b=Buffer.from(expected,'hex'); return a.length===b.length && crypto.timingSafeEqual(a,b); }
function limited(req) { const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim(); const now=Date.now(); const a=(rate.get(ip)||[]).filter(t=>now-t<60000); if(a.length>=20) return false; a.push(now); rate.set(ip,a); return true; }
function cleanName(v) { return typeof v==='string' && /^[a-zA-Z0-9_]{3,18}$/.test(v); }
function broadcast(room, payload, except=null) { const msg=JSON.stringify(payload); for(const client of rooms.get(room)?.values()||[]) if(client!==except && client.readyState===WebSocket.OPEN) client.send(msg); }
function roomPlayers(room) { return [...(rooms.get(room)?.values()||[])].filter(c=>c.readyState===WebSocket.OPEN && c.player).map(c=>({id:c.player.id,username:c.player.username,name:c.player.name,zone:c.player.zone,x:c.player.x,y:c.player.y,cls:c.player.cls})); }

async function initDb() { await pool.query(`CREATE TABLE IF NOT EXISTS game_accounts (id BIGSERIAL PRIMARY KEY, username VARCHAR(18) UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`); await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS game_accounts_username_lower_uq ON game_accounts (LOWER(username))'); }
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(req.method==='OPTIONS') return json(res,204,{});
  if(req.method==='GET' && url.pathname==='/health') return json(res,200,{ok:true,game:'Legnd of Gate',service:'online-starter',database:'postgresql'});
  if(req.method==='POST' && (url.pathname==='/api/register'||url.pathname==='/api/login')) {
    if(!limited(req)) return json(res,429,{error:'ช้า ๆ หน่อย ลองใหม่ภายหลัง'});
    try {
      const body=await readBody(req); const username=String(body.username||'').trim(); const password=String(body.password||'');
      if(!cleanName(username)) return json(res,400,{error:'ชื่อบัญชีต้องเป็น a-z, A-Z, 0-9 หรือ _ ความยาว 3–18 ตัว'});
      if(password.length<8 || password.length>128) return json(res,400,{error:'รหัสผ่านต้องยาว 8–128 ตัวอักษร'});
      if(url.pathname==='/api/register') {
        const cred=await passwordHash(password);
        try { const result=await pool.query('INSERT INTO game_accounts(username,password_hash,password_salt) VALUES($1,$2,$3) RETURNING id,username',[username,cred.hash,cred.salt]); const user=result.rows[0]; return json(res,201,{token:makeToken(user),user:{id:String(user.id),username:user.username}}); }
        catch(e) { if(e.code==='23505') return json(res,409,{error:'ชื่อนี้มีผู้ใช้แล้ว'}); throw e; }
      }
      const result=await pool.query('SELECT id,username,password_hash,password_salt FROM game_accounts WHERE LOWER(username)=LOWER($1)',[username]);
      if(!result.rowCount || !(await passwordMatches(password,result.rows[0].password_salt,result.rows[0].password_hash))) return json(res,401,{error:'ชื่อบัญชีหรือรหัสผ่านไม่ถูกต้อง'});
      const user=result.rows[0]; return json(res,200,{token:makeToken(user),user:{id:String(user.id),username:user.username}});
    } catch(e) { if(e.message==='bad_json') return json(res,400,{error:'ข้อมูล JSON ไม่ถูกต้อง'}); console.error(e); return json(res,500,{error:'เซิร์ฟเวอร์ขัดข้อง'}); }
  }
  json(res,404,{error:'not_found'});
});
const wss=new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade',(req,socket,head)=>{ const url=new URL(req.url,'http://localhost'); if(url.pathname!=='/ws'){socket.destroy();return;} const user=verifyToken(url.searchParams.get('token')||''); if(!user){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;} wss.handleUpgrade(req,socket,head,ws=>{ws.auth=user;wss.emit('connection',ws,req);}); });
wss.on('connection',(ws)=>{
  ws.isAlive=true; ws.on('pong',()=>ws.isAlive=true);
  ws.player={id:ws.auth.sub,username:ws.auth.username,name:ws.auth.username,zone:'Prontera',x:4,y:4,cls:'นักดาบ'};
  const room='world'; if(!rooms.has(room)) rooms.set(room,new Set()); rooms.get(room).add(ws);
  ws.send(JSON.stringify({type:'welcome',player:ws.player,players:roomPlayers(room)})); broadcast(room,{type:'players',players:roomPlayers(room)},ws);
  ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString());}catch{return;} if(!msg||typeof msg.type!=='string')return;
    if(msg.type==='join') { ws.player.name=typeof msg.name==='string'?msg.name.slice(0,18):ws.auth.username; ws.player.zone=typeof msg.zone==='string'?msg.zone.slice(0,32):'Prontera'; ws.player.cls=typeof msg.cls==='string'?msg.cls.slice(0,20):'นักดาบ'; broadcast(room,{type:'players',players:roomPlayers(room)}); }
    else if(msg.type==='move') { const x=Number(msg.x),y=Number(msg.y); if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>10000||Math.abs(y)>10000)return; ws.player.x=Math.round(x);ws.player.y=Math.round(y); if(typeof msg.zone==='string')ws.player.zone=msg.zone.slice(0,32); broadcast(room,{type:'players',players:roomPlayers(room)}); }
    else if(msg.type==='chat' && typeof msg.text==='string') {const text=msg.text.trim().slice(0,180);if(!text)return;broadcast(room,{type:'chat',username:ws.player.name,text,at:Date.now()});}
    else if(msg.type==='ping') ws.send(JSON.stringify({type:'pong',at:Date.now()}));
  });
  ws.on('close',()=>{rooms.get(room)?.delete(ws);broadcast(room,{type:'players',players:roomPlayers(room)});});
  ws.on('error',()=>{rooms.get(room)?.delete(ws);});
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},25000);
initDb().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Legnd of Gate server listening on ${PORT}`))).catch(e=>{console.error('Database initialization failed',e);process.exit(1);});
process.on('SIGTERM',()=>{clearInterval(heartbeat);server.close(()=>pool.end());});
