// Narrow receipt capabilities, not passwords or administrative API tokens.
// Tab lifetime only. Explicit logout forgets all keys; reconnection retains them.
import {isId,isKey} from './contracts.js';
const STORE='irisops-guard-recovery-v1';
export class RecoveryStore {
  #storage;
  constructor(storage){this.#storage=storage;}
  #read(){
    const raw=this.#storage.getItem(STORE);
    if(!raw)return {last:'',entries:[]};
    const value=JSON.parse(raw);
    if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='entries,last'||!isId(value.last)||!Array.isArray(value.entries)||value.entries.length>64||
      value.entries.some(e=>!Array.isArray(e)||e.length!==2||!isId(e[0])||!isKey(e[1]))||
      new Set(value.entries.map(e=>e[0])).size!==value.entries.length||
      !value.entries.some(e=>e[0]===value.last))
      throw new Error('recovery_storage_invalid');
    return value;
  }
  remember(id,key){
    if(!isId(id)||!isKey(key))throw new Error('recovery_key_required');
    const value=this.#read(), existing=value.entries.find(e=>e[0]===id);
    if(existing&&existing[1]!==key)throw new Error('recovery_key_conflict');
    if(!existing){
      if(value.entries.length>=64)throw new Error('recovery_storage_full');
      value.entries.push([id,key]);
    }
    value.last=id;
    const encoded=JSON.stringify(value);
    this.#storage.setItem(STORE,encoded);
    if(this.#storage.getItem(STORE)!==encoded)throw new Error('recovery_storage_unavailable');
  }
  get(id){if(!isId(id))throw new Error('invalid_id');return this.#read().entries.find(e=>e[0]===id)?.[1]||'';}
  last(){return this.#read().last;}
  clear(){this.#storage.removeItem(STORE);if(this.#storage.getItem(STORE)!==null)throw new Error('recovery_forget_failed');}
}
