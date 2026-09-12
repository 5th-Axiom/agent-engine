import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createAgentEngine, type BindingContext } from '@agent-runtime/sdk';
import { MemoryStore, scriptedModel, toolCall, finalText } from '@agent-runtime/testing';
import { createChatHandler, type ChatHandlerOptions } from '@agent-runtime/chat-server';
it('resolves only opaque references after session authorization; legacy hosts reject references', async () => {
  const reads: BindingContext[]=[];
  const model=scriptedModel([toolCall('read',{}),finalText('ok')]);
  const engine=await createAgentEngine({store:new MemoryStore(),principal:{tenantId:'t',subjectId:'a'},
    authorize:async()=>true,secrets:{resolve:async()=> 'synthetic'}, adapters:{models:{scripted:model}},
    bindings:{read:{version:'1',sideEffect:'read',execute:async(_,ctx)=>{reads.push(ctx);return {value:'safe'};}}},policy:{allowedOrigins:['https://model.example.com']}});
  let origin='',calls=0;
  const resolve: NonNullable<ChatHandlerOptions['resolveRunContext']> = async({contextRef})=>{calls++;return {scopeId:contextRef??'default'};};
  const options: ChatHandlerOptions={basePath:'/chat',namespace:'context',allowedOrigins:()=>[origin],resolveRunContext:resolve,
    resolveContext:async(req)=>({engine:engine.forPrincipal({tenantId:'t',subjectId:String(req.headers['x-user']??'a')}),assistants:[{id:'demo',label:'Demo',config:{
      models:{primary:{provider:'scripted',baseURL:'https://model.example.com',model:'x',apiKey:{secretRef:'KEY'},limits:{contextWindowTokens:32000,maxOutputTokens:1000}}},routing:{primary:'primary'},
      tools:[{name:'read',description:'read',inputSchema:{type:'object'},outputSchema:true,execution:{type:'binding',bindingKey:'read',sideEffect:'read'}}]}}]})};
  let handler=createChatHandler(options);
  const server=createServer((req,res)=>{void handler(req,res)}); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const post=(path:string,body:unknown,user='a')=>fetch(origin+'/chat'+path,{method:'POST',headers:{origin,'content-type':'application/json','x-agent-chat':'1','x-user':user},body:JSON.stringify(body)});
  try {
    const {id}=await (await post('/sessions',{assistantId:'demo',requestId:randomUUID()})).json();
    expect((await post(`/sessions/${id}/runs`,{input:'read',requestId:randomUUID(),contextRef:'scope-a'},'b')).status).toBe(403);expect(calls).toBe(0);
    const response=await post(`/sessions/${id}/runs`,{input:'read',requestId:randomUUID(),contextRef:'scope-a'});expect(response.status).toBe(202);
    for(let i=0;i<100&&!reads.length;i++)await new Promise(r=>setTimeout(r,10));
    expect(reads[0]?.context).toEqual({scopeId:'scope-a'});expect(JSON.stringify(model.requests[0])).not.toContain('scope-a');
    handler=createChatHandler({...options,resolveRunContext:undefined});
    expect((await post(`/sessions/${id}/runs`,{input:'legacy',requestId:randomUUID(),contextRef:'scope-a'})).status).toBe(400);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await engine.close();}
});
