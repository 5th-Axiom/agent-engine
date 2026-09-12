import { expect, it } from 'vitest';
import { ChatController, ChatError, type ChatTransport } from '@agent-runtime/chat-core';
import { randomUUID } from 'node:crypto';
it('freezes opaque host context with the request, despite page switches and lost acknowledgements', async () => {
  const id=randomUUID(), runId=randomUUID(), sent: unknown[]=[];
  const transport: ChatTransport = {
    getConfig:async()=>({protocolVersion:1,defaultAssistant:'demo',maxInputLength:8000,assistants:[{id:'demo',label:'Demo'}]}),
    listSessions:async()=>[], createSession:async()=>({id}),
    readSession:async()=>({id,assistantId:'demo',title:'Synthetic',runs:[],totalRuns:0,snapshotSequence:0}),
    sendMessage:async(_id,input)=>{sent.push(input);if(sent.length===1)throw new ChatError('CHAT_CONNECTION_FAILED');return {runId};},
    cancelRun:async()=>({accepted:true}),
  };
  const controller=new ChatController(transport,{idlePollMs:60000});
  try {
    await controller.start(); controller.setContextRef('scope-a'); await controller.send('why?');
    controller.setContextRef('scope-b'); await controller.retrySend();
    expect(sent[0]).toEqual(sent[1]); expect(sent[1]).toMatchObject({contextRef:'scope-a'});
    expect(controller.snapshot.contextRef).toBe('scope-b');
    expect(()=>controller.setContextRef('browser supplied {context}')).toThrow();
  } finally { controller.dispose(); }
});
