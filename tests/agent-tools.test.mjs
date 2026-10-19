import test from 'node:test';
import assert from 'node:assert/strict';
import {agentRequestOptions,ToolCallAccumulator,agentToolReply} from '../src/lib/overlay/agent-tools.ts';
test('OpenRouter brain requests identify the client and expose only an implemented read-only status tool',()=>{
 const options=agentRequestOptions({preset:'openrouter',kind:'brain'});
 assert.equal(options.headers['X-OpenRouter-Categories'],'cli-agent');
 assert.equal(options.body.tools[0].function.name,'get_workspace_status');
 assert.equal(agentRequestOptions({preset:'openrouter',kind:'vision'}),null);
 assert.equal(agentRequestOptions({preset:'openrouter',kind:'brain',variables:{FLUELY_AGENT_TOOLS:'off'}}),null);
});
test('fragmented streamed tool calls retain IDs and argument fragments, never execute arbitrary commands',()=>{
 const state=new ToolCallAccumulator();
 state.add({choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name:'get_workspace_status',arguments:'{'}}]}}]});
 state.add({choices:[{delta:{tool_calls:[{index:0,function:{arguments:'}'}}]}}]});
 const calls=state.finish();assert.equal(calls[0].function.arguments,'{}');
 const reply=agentToolReply(calls[0]);assert.equal(reply.tool_call_id,'call_1');
 const data=JSON.parse(reply.content);assert.equal(data.workspace_connected,false);assert.deepEqual(data.files,[]);
 assert.match(data.message,/text request/);
 const unknown=agentToolReply({...calls[0],function:{name:'run_shell',arguments:'{}'}});
 assert.equal(JSON.parse(unknown.content).error,'unsupported_tool');
});
test('JSON replies and bounded malformed tool streams are handled explicitly',()=>{
 const state=new ToolCallAccumulator();state.add({choices:[{message:{tool_calls:[{id:'a',type:'function',function:{name:'get_workspace_status',arguments:'{}'}}]}}]});assert.equal(state.finish().length,1);
 const missing=new ToolCallAccumulator();missing.add({choices:[{delta:{tool_calls:[{index:0,function:{name:'get_workspace_status',arguments:'{}'}}]}}]});assert.throws(()=>missing.finish(),/tool call/);
 const oversized=new ToolCallAccumulator();assert.throws(()=>oversized.add({choices:[{delta:{tool_calls:[{index:0,id:'a',function:{arguments:'x'.repeat(32769)}}]}}]}),/limit/);
});
test('opaque reasoning fragments survive the tool round without being shown as user text',()=>{
 const state=new ToolCallAccumulator();state.add({choices:[{delta:{reasoning_details:[{index:0,type:'reasoning.encrypted',id:'reason-1',data:'encrypted-'}]}}]});state.add({choices:[{delta:{reasoning_details:[{index:0,type:'reasoning.encrypted',data:'continuation'}]}}]});
 assert.deepEqual(state.reasoningDetails(),[{index:0,type:'reasoning.encrypted',id:'reason-1',data:'encrypted-continuation'}]);assert.deepEqual(state.finish(),[]);
 const summary=new ToolCallAccumulator();summary.add({choices:[{message:{reasoning_details:[{type:'reasoning.summary',summary:'Required summary',index:0,provider_extra:{opaque:true}}]}}]});assert.equal(summary.reasoningDetails()[0].summary,'Required summary');assert.deepEqual(summary.reasoningDetails()[0].provider_extra,{opaque:true});
});
