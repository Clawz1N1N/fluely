/** Preserve current input while fitting recent chat context in the native UTF-8 limit. */
export function boundedChatQuestion(instructions:string,history:unknown[]|undefined,input:string):string {
  const tail=`Запит:\n${input}`;
  const label='Історія поточного чату для цього запиту:\n';
  const encoder=new TextEncoder();
  const budget=32768-encoder.encode(instructions+tail+label+'\n\n').length;
  const recent:unknown[]=[];
  for(const message of (history??[]).slice(-20).reverse()){
    const candidate=[message,...recent];
    if(encoder.encode(JSON.stringify(candidate)).length>budget)break;
    recent.unshift(message);
  }
  return instructions+(recent.length?label+JSON.stringify(recent)+'\n\n':'')+tail;
}
