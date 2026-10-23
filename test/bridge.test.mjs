import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { WebSocket } from 'ws';
import { createBridge } from '../bridge.mjs';

async function setup(t,timeoutMs=500) {
  const token='test-token';const bridge=await createBridge({port:0,token,timeoutMs});
  t.after(()=>bridge.close());
  const base=`http://127.0.0.1:${bridge.port}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  async function connect(tokenValue=token){
    const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/plugin`,{origin:'https://www.figma.com'});
    await once(ws,'open');ws.send(JSON.stringify({type:'hello',token:tokenValue,documentId:'test-document',name:'Test file',page:'Page 1'}));return ws;
  }
  const command=()=>fetch(`${base}/command`,{method:'POST',headers,body:JSON.stringify({action:'document',targetDocumentId:'test-document'})});
  return {base,headers,connect,command};
}
test('rejects unauthenticated HTTP and browser-origin requests',async t=>{
  const {base,headers}=await setup(t);
  assert.equal((await fetch(`${base}/status`)).status,401);
  assert.equal((await fetch(`${base}/status`,{headers:{...headers,Origin:'https://evil.example'}})).status,401);
  assert.equal((await fetch(`${base}/status`,{headers})).status,200);
});
test('requires a connected plugin and rejects wrong pairing token',async t=>{
  const {command,connect}=await setup(t);
  assert.equal((await command()).status,409);
  const ws=await connect('incorrect');const [code]=await once(ws,'close');assert.equal(code,1008);
});
test('round-trips commands and rejects overlapping writes',async t=>{
  const {base,connect,command}=await setup(t);const ws=await connect();await once(ws,'message');
  const message=once(ws,'message');const response=command();const [raw]=await message;
  const sent=JSON.parse(raw.toString());assert.equal(sent.action,'document');assert.equal(sent.targetDocumentId,'test-document');
  assert.equal((await command()).status,409);
  assert.equal((await fetch(`${base}/shutdown`,{method:'POST'})).status,401);
  ws.send(JSON.stringify({id:sent.id,result:{createdNodeIds:['1:2']}}));
  assert.deepEqual(await (await response).json(),{createdNodeIds:['1:2']});
});
test('a slow overlapping request cannot unlock another active command',async t=>{
  const {base,headers,connect,command}=await setup(t,3000);
  const ws=await connect();await once(ws,'message');
  let complete;
  const slowResponse=new Promise(resolve=>{complete=resolve;});
  const slow=request(`${base}/command`,{method:'POST',headers:{...headers,Expect:'100-continue','Transfer-Encoding':'chunked'}},complete);
  slow.on('error',()=>{});t.after(()=>slow.destroy());
  slow.flushHeaders();await once(slow,'continue');
  const message=once(ws,'message');const active=command();const [raw]=await message;
  slow.end(JSON.stringify({action:'document',targetDocumentId:'test-document'}));
  const rejected=await slowResponse;assert.equal(rejected.statusCode,409);rejected.resume();
  assert.equal((await command()).status,409);
  assert.equal((await fetch(`${base}/shutdown`,{method:'POST',headers})).status,409);
  ws.send(JSON.stringify({id:JSON.parse(raw.toString()).id,result:{ok:true}}));
  assert.equal((await active).status,200);
});
test('authenticated shutdown closes the listener and is idempotent',async t=>{
  const {base,headers}=await setup(t);
  assert.equal((await fetch(`${base}/shutdown`,{method:'POST',headers:{...headers,Origin:'https://evil.example'}})).status,401);
  assert.deepEqual(await (await fetch(`${base}/shutdown`,{method:'POST',headers})).json(),{stopped:true});
});
test('the bridge assigns command IDs rather than trusting client-supplied ones',async t=>{
  const {base,headers,connect}=await setup(t);const ws=await connect();await once(ws,'message');
  const message=once(ws,'message');
  const response=fetch(`${base}/command`,{method:'POST',headers,body:JSON.stringify({id:'caller-supplied',action:'document',targetDocumentId:'test-document'})});
  const [raw]=await message;const sent=JSON.parse(raw.toString());assert.notEqual(sent.id,'caller-supplied');
  ws.send(JSON.stringify({id:sent.id,result:{ok:true}}));assert.equal((await response).status,200);
});
test('does not silently replace the selected Figma connection',async t=>{
  const {connect}=await setup(t);const first=await connect();await once(first,'message');
  const second=await connect();const [code]=await once(second,'close');assert.equal(code,1008);assert.equal(first.readyState,WebSocket.OPEN);
});
test('disconnect rejects pending call instead of hanging',async t=>{
  const {connect,command}=await setup(t);const ws=await connect();await once(ws,'message');
  const message=once(ws,'message');const response=command();await message;ws.close();
  assert.match((await (await response).json()).error,/disconnected/);
});
test('timeout reports uncertain outcome and closes plugin',async t=>{
  const {connect,command}=await setup(t,30);const ws=await connect();await once(ws,'message');
  const closed=once(ws,'close');const response=await command();assert.equal(response.status,500);
  assert.match((await response.json()).error,/may have changed/);assert.equal((await closed)[0],1011);
});
