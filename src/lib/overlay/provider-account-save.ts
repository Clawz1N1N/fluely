interface Ports {
  get(key:string):Promise<string|null>;set(key:string,value:string):Promise<unknown>;remove(key:string):Promise<unknown>;
  publish():Promise<unknown>;
}
/** A failed metadata transaction must not change the key used by existing models. */
export async function publishProviderAccount(vaultKey:string,newKey:string,ports:Ports):Promise<void>{
  if(!newKey){await ports.publish();return;}
  const previous=await ports.get(vaultKey);
  try{
    await ports.set(vaultKey,newKey);
    if(await ports.get(vaultKey)!==newKey)throw new Error('Could not verify the protected API key');
    await ports.publish();
  }catch(error){
    try{
      if(previous===null)await ports.remove(vaultKey);else await ports.set(vaultKey,previous);
      if(await ports.get(vaultKey)!==previous)throw new Error('rollback verification');
    }catch{throw new Error('Saving failed and the previous API key could not be restored. Check the account key before retrying.');}
    throw error;
  }
}
