export const TRANSPORT_EVENTS = Object.freeze(["data", "state", "error"]);
export class TransportEventEmitter {
 constructor(){this._listeners=new Map();}
 on(name,listener){if(!TRANSPORT_EVENTS.includes(name)||typeof listener!=="function")throw new TypeError("Invalid transport event listener.");const set=this._listeners.get(name)??new Set();set.add(listener);this._listeners.set(name,set);return()=>this.off(name,listener);}
 off(name,listener){const set=this._listeners.get(name);if(!set)return false;const removed=set.delete(listener);if(!set.size)this._listeners.delete(name);return removed;}
 emit(name,payload){for(const listener of [...(this._listeners.get(name)??[])]){try{listener(payload);}catch{/* isolate consumer callbacks */}}}
 removeAllListeners(){this._listeners.clear();}
}
