import { TransportError } from "./transport-errors.js";
import { TransportEventEmitter } from "./transport-events.js";
export class TransportAdapter {
  constructor({ descriptor, maxBufferedBytes = 65536, maxQueuedWrites = 32 } = {}) {
    if (!descriptor || typeof descriptor.transportId !== "string" || !descriptor.transportId.trim()) throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR","A transportId is required.");
    if (!Number.isSafeInteger(maxBufferedBytes)||maxBufferedBytes<1||!Number.isSafeInteger(maxQueuedWrites)||maxQueuedWrites<1) throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR","Buffer limits must be positive integers.");
    this._descriptor=structuredClone(descriptor); this._state="disconnected"; this._events=new TransportEventEmitter();
    this._maxBufferedBytes=maxBufferedBytes; this._maxQueuedWrites=maxQueuedWrites; this._queuedWrites=0;
    this._writeQueue=Promise.resolve(); this._lifecycleQueue=Promise.resolve(); this._disposed=false;
    this._connectPromise=null; this._disconnectPromise=null; this._disposePromise=null;
  }
  get state(){return this._state;}
  getDescriptor(){return structuredClone(this._descriptor);}
  on(name,fn){return this._events.on(name,fn);}
  off(name,fn){return this._events.off(name,fn);}
  _enqueue(fn){const result=this._lifecycleQueue.then(fn);this._lifecycleQueue=result.catch(()=>{});return result;}
  _setState(state,details={}){this._state=state;this._events.emit("state",{state,transportId:this._descriptor.transportId,...details});}
  async connect(options={}) {
    if(this._disposed)throw new TransportError("TRANSPORT_DISPOSED","Transport has been disposed.");
    if(this._state==="connected")return this;
    if(this._connectPromise)return this._connectPromise;
    this._connectPromise=this._enqueue(async()=>{
      if(this._disposed)throw new TransportError("TRANSPORT_DISPOSED","Transport has been disposed.");
      if(this._state==="connected")return this;
      this._setState("connecting");
      try{await this.onConnect(options);this._setState("connected");return this;}
      catch(cause){this._setState("error",{code:"TRANSPORT_CONNECT_FAILED"});throw this._wrap("TRANSPORT_CONNECT_FAILED","Transport connection failed.",cause);}
    }).finally(()=>{this._connectPromise=null;});
    return this._connectPromise;
  }
  async disconnect(){
    if(this._disposed||this._state==="disconnected")return this;
    if(this._disconnectPromise)return this._disconnectPromise;
    this._disconnectPromise=this._enqueue(async()=>{
      if(this._state==="disconnected")return this;
      this._setState("disconnecting");
      try{await this.onDisconnect();this._setState("disconnected");return this;}
      catch(cause){this._setState("error",{code:"TRANSPORT_DISCONNECT_FAILED"});throw this._wrap("TRANSPORT_DISCONNECT_FAILED","Transport disconnect failed.",cause);}
    }).finally(()=>{this._disconnectPromise=null;});
    return this._disconnectPromise;
  }
  async write(data){
    if(this._disposed)throw new TransportError("TRANSPORT_DISPOSED","Transport has been disposed.");
    if(this._state!=="connected")throw new TransportError("TRANSPORT_NOT_CONNECTED","Cannot write while disconnected.",{state:this._state});
    const bytes=data instanceof Uint8Array?data.slice():data instanceof ArrayBuffer?new Uint8Array(data.slice(0)):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength).slice():null;
    if(!bytes)throw new TransportError("TRANSPORT_WRITE_FAILED","Transport writes require byte data.");
    if(this._queuedWrites>=this._maxQueuedWrites)throw new TransportError("TRANSPORT_WRITE_QUEUE_FULL","Transport write queue is full.");
    this._queuedWrites++;
    const op=this._writeQueue.then(async()=>{if(this._state!=="connected")throw new TransportError("TRANSPORT_NOT_CONNECTED","Transport disconnected before write.");try{await this.onWrite(bytes);}catch(cause){throw this._wrap("TRANSPORT_WRITE_FAILED","Transport write failed.",cause);}});
    this._writeQueue=op.catch(()=>{});
    try{await op;}finally{this._queuedWrites--;}
  }
  _emitData(data){
    const bytes=data instanceof Uint8Array?data.slice():data instanceof ArrayBuffer?new Uint8Array(data.slice(0)):null;
    if(!bytes)throw new TransportError("TRANSPORT_READ_FAILED","Received data must be an ArrayBuffer or Uint8Array.");
    if(this._state!=="connected")return false;
    if(bytes.byteLength>this._maxBufferedBytes){this._events.emit("error",new TransportError("TRANSPORT_READ_FAILED","Receive chunk exceeds buffer limit."));return false;}
    this._events.emit("data",bytes);return true;
  }
  _unexpectedDisconnect(cause){if(this._disposed||this._state==="disconnected")return;this._setState("disconnected",{unexpected:true});if(cause)this._events.emit("error",this._wrap("TRANSPORT_UNAVAILABLE","Transport disconnected unexpectedly.",cause));}
  _wrap(code,message,cause){return new TransportError(code,message,cause?{cause}:{});}
  async dispose(){
    if(this._disposePromise)return this._disposePromise;
    this._disposePromise=(async()=>{if(this._disposed)return;await this.disconnect();this._disposed=true;this._setState("disposed");this._events.removeAllListeners();await this.onDispose();})();
    return this._disposePromise;
  }
  async onConnect(){} async onDisconnect(){} async onWrite(){throw new TransportError("TRANSPORT_WRITE_FAILED","Write is not implemented.");} async onDispose(){}
}
