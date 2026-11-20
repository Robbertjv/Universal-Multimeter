import {DATA_CHARACTERISTIC_UUID,PacketFramer,parsePacket,makeKeyPacket} from "./drivers/eevblog-121gw.js";

const $=id=>document.getElementById(id);
const state={device:null,server:null,characteristic:null,connected:false,latest:null,packets:0,invalid:0,history:[],logging:false,log:[],logStarted:null,mqtt:null,db:null,previousSubLabel:null};
const log=(message,level="info")=>{
 const line=document.createElement("div");line.className=level;line.textContent=`[${new Date().toLocaleTimeString()}] ${message}`;
 $("console").append(line);$("console").scrollTop=$("console").scrollHeight;
 while($("console").children.length>250)$("console").firstChild.remove();
};
function setConnection(online,name=""){
 state.connected=online;
 $("connection-status").className="status-pill "+(online?"online":"offline");
 $("connection-status").innerHTML=`<i></i> ${online?"CONNECTED":"OFFLINE"}`;
 $("device-name").textContent=name|| (online?"EEVblog 121GW":"Geen meter verbonden");
 $("connect-btn").disabled=online;$("disconnect-btn").disabled=!online;$("logging-toggle").disabled=!online;
}
function fmt(value,unit="",digits=6){return value==null?"—":Number(value).toLocaleString("nl-NL",{maximumSignificantDigits:digits})+(unit?" "+unit:"");}
function setIcon(name,on){const el=document.querySelector(`[data-icon="${name}"]`);if(el)el.classList.toggle("active",!!on);}
function render(reading){
 state.latest=reading;
 fetch("/api/measurement",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mqttPayload(reading))}).catch(()=>{});
 $("mode-name").textContent=reading.modeName;
 $("main-reading").textContent=reading.main.text.trim()||"—";
 $("main-unit").textContent=reading.main.unit;
 $("sub-label").textContent=reading.sub.label||"SUB";
 $("sub-reading").textContent=(reading.sub.negative?"−":"")+reading.sub.text;
 $("sub-unit").textContent=reading.sub.unit;
 $("serial-number").textContent="S/N "+reading.serial;
 $("last-update").textContent=new Date(reading.receivedAt).toLocaleTimeString();
 $("battery-indicator").classList.toggle("active",reading.icons.lowBattery);
 $("battery-indicator").textContent=reading.icons.lowBattery?"LOW BAT":"BAT";
 $("bt-indicator").classList.toggle("active",reading.icons.bluetooth);
 $("apo-indicator").classList.toggle("active",reading.icons.apo);
 const i=reading.icons;
 setIcon("ac",i.ac);setIcon("dc",i.dc);setIcon("auto",i.auto);setIcon("rel",i.relative);setIcon("hold",i.hold>0);setIcon("minmax",i.minMax>0);setIcon("peak",i.peak);setIcon("lp",i.lowPass);
 const segments=$("bargraph").children;
 [...segments].forEach((el,index)=>el.classList.toggle("on",reading.bar.on&&index<reading.bar.segments));
 $("bar-minus").style.visibility=reading.bar.negative?"visible":"hidden";
 $("bar-scale").textContent=reading.bar.scale;
 if(reading.batteryVoltage!=null)$("battery-voltage").textContent=reading.batteryVoltage.toFixed(2)+" V";
 $("raw-packet").textContent=reading.raw.map(v=>v.toString(16).padStart(2,"0")).join(" ").toUpperCase();
 state.history.push({x:reading.receivedAt,y:reading.main.baseValue,unit:reading.main.baseUnit});
 const cutoff=Date.now()-3600000;state.history=state.history.filter(p=>p.x>=cutoff).slice(-5000);
 updateChart();updateStats();
 if(state.logging&&reading.main.baseValue!=null&&!reading.main.overload&&reading.main.text.trim()!=="")addLog(reading);
 publishMqtt(reading);
}
function updateStats(){
 const values=state.history.map(p=>p.y).filter(Number.isFinite);if(!values.length)return;
 const min=Math.min(...values),max=Math.max(...values),avg=values.reduce((a,b)=>a+b,0)/values.length,unit=state.latest?.main.baseUnit||"";
 $("stat-min").textContent=fmt(min,unit);$("stat-max").textContent=fmt(max,unit);$("stat-avg").textContent=fmt(avg,unit);$("stat-pp").textContent=fmt(max-min,unit);
}
let chart=null;
function initChart(){
 if(!window.Chart){log("Chart.js niet geladen; grafiek uitgeschakeld.","warn");return;}
 chart=new Chart($("measurement-chart"),{type:"line",data:{datasets:[{label:"Measurement",data:[],borderColor:"#f1c40f",backgroundColor:"rgba(241,196,15,.08)",borderWidth:2,pointRadius:0,tension:.18,fill:true}]},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.parsed.y,state.latest?.main.baseUnit||"")}}},scales:{x:{type:"linear",ticks:{color:"#777",callback:v=>new Date(v).toLocaleTimeString()},grid:{color:"#333"}},y:{ticks:{color:"#aaa"},grid:{color:"#333"}}}}});
}
function updateChart(){
 if(!chart)return;const seconds=Number($("graph-window").value),cutoff=Date.now()-seconds*1000;
 chart.data.datasets[0].data=state.history.filter(p=>p.x>=cutoff&&Number.isFinite(p.y)).map(p=>({x:p.x,y:p.y}));
 chart.options.scales.x.min=cutoff;chart.options.scales.x.max=Date.now();chart.update("none");
}
function addLog(r){
 const row={time:new Date(r.receivedAt).toISOString(),mode:r.modeName,value:r.main.value,baseValue:r.main.baseValue,unit:r.main.unit,baseUnit:r.main.baseUnit,raw:r.raw.map(x=>x.toString(16).padStart(2,"0")).join("")};
 state.log.push(row);if(state.db)dbAdd(row).catch(e=>log("IndexedDB: "+e.message,"warn"));
 $("log-count").textContent=state.log.length+" records";
 const tr=document.createElement("tr");[new Date(row.time).toLocaleTimeString(),row.mode,fmt(row.value),row.unit].forEach(text=>{const td=document.createElement("td");td.textContent=text;tr.append(td);});
 const body=$("log-table");if(body.querySelector(".empty"))body.replaceChildren();body.prepend(tr);while(body.children.length>100)body.lastChild.remove();
}
function setLogging(on){
 state.logging=on;if(on&&!state.logStarted)state.logStarted=Date.now();
 $("logging-toggle").textContent=on?"STOP LOGGING":"START LOGGING";
 $("logging-state").textContent=on?"RECORDING":"STOPPED";$("logging-state").style.color=on?"#2ecc71":"#999";
 log(on?"Measurement logging started.":"Measurement logging stopped.");
}
function exportCsv(){
 if(!state.log.length){log("Geen meetgegevens om te exporteren.","warn");return;}
 const headers=["timestamp","mode","value","unit","base_value","base_unit","raw_hex"];
 const csv=[headers.join(","),...state.log.map(r=>[r.time,r.mode,r.value??"",r.unit,r.baseValue??"",r.baseUnit,r.raw].map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(","))].join("\r\n");
 const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="121gw-measurements-"+new Date().toISOString().replaceAll(":","-")+".csv";a.click();URL.revokeObjectURL(url);
}
async function initDb(){
 if(!("indexedDB"in window))return;
 state.db=await new Promise((resolve,reject)=>{const req=indexedDB.open("universal-multimeter",1);req.onupgradeneeded=()=>req.result.createObjectStore("measurements",{keyPath:"id",autoIncrement:true});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
function dbAdd(row){return new Promise((resolve,reject)=>{const tx=state.db.transaction("measurements","readwrite");tx.objectStore("measurements").add(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function connectBle(){
 if(!navigator.bluetooth){log("Web Bluetooth is niet beschikbaar in deze browser. Gebruik Chrome via HTTPS of localhost.","error");return;}
 try{
  log("Zoeken naar EEVblog 121GW…");
  const device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:"121GW"},{namePrefix:"Bluegiga"}],optionalServices:["generic_access","device_information","battery_service","0bd51666-e7cb-469b-8e4d-2742f1ba77cc"]});
  state.device=device;device.addEventListener("gattserverdisconnected",onDisconnected);
  state.server=await device.gatt.connect();
  const services=await state.server.getPrimaryServices();
  let found=null;
  for(const service of services){try{found=await service.getCharacteristic(DATA_CHARACTERISTIC_UUID);if(found)break;}catch{}}
  if(!found)throw new Error("121GW data characteristic niet gevonden. Controleer dat Bluetooth op de meter is ingeschakeld.");
  state.characteristic=found;
  found.addEventListener("characteristicvaluechanged",onBleData);
  await found.startNotifications();
  setConnection(true,device.name||"EEVblog 121GW");
  log("Verbonden met "+(device.name||"EEVblog 121GW")+". Notifications actief.","info");
 }catch(e){log(e.message||String(e),"error");if(state.server?.connected)state.server.disconnect();}
}
function onBleData(event){
 const view=event.target.value;const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
 const packets=framer.push(bytes);
 state.invalid=framer.invalid;$("invalid-count").textContent=state.invalid;
 for(const packet of packets){state.packets++;$("packet-count").textContent=state.packets;
  const reading=parsePacket(packet,Date.now(),state.previousSubLabel);if(!reading)continue;
  state.previousSubLabel=reading.sub.label||state.previousSubLabel;render(reading);
 }
}
const framer=new PacketFramer();
function onDisconnected(){setConnection(false);state.characteristic=null;state.server=null;framer.reset();log("Bluetoothverbinding verbroken.","warn");}
async function disconnectBle(){try{if(state.characteristic)await state.characteristic.stopNotifications();}catch{}if(state.device?.gatt?.connected)state.device.gatt.disconnect();onDisconnected();}
async function sendKey(key,longPress=false){
 if(!state.characteristic||!state.connected){log("Geen actieve meterverbinding.","warn");return;}
 try{
  const data=makeKeyPacket(key,longPress);
  if(state.characteristic.properties.write)await state.characteristic.writeValueWithResponse(data);
  else if(state.characteristic.properties.writeWithoutResponse)await state.characteristic.writeValueWithoutResponse(data);
  else throw new Error("Characteristic ondersteunt geen writes.");
  log(`Key ${key} ${longPress?"long":"short"} verzonden.`);
 }catch(e){log("Knop verzenden mislukt: "+e.message,"error");}
}
function mqttPayload(r){return {device:"EEVblog 121GW",serial:r.serial,timestamp:new Date(r.receivedAt).toISOString(),mode:r.modeName,value:r.main.value,unit:r.main.unit,baseValue:r.main.baseValue,baseUnit:r.main.baseUnit,overload:r.main.overload,sub:r.sub,bar:r.bar,icons:r.icons,batteryVoltage:r.batteryVoltage};}
function publishMqtt(r){const payload=mqttPayload(r);if(state.mqtt?.connected){const topic=$("mqtt-topic").value.trim();if(topic)state.mqtt.publish(topic,JSON.stringify(payload),{qos:0,retain:false},e=>{if(e)log("MQTT publish: "+e.message,"error");});}else if($("mqtt-transport").value==="tcp"&&$("mqtt-state").textContent==="BRIDGE CONNECTED"){fetch("/api/mqtt/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).catch(()=>{});}}
function mqttConnect(){
 if(!window.mqtt){log("MQTT.js niet geladen.","error");return;}
 const host=$("mqtt-host").value.trim(),port=Number($("mqtt-port").value),transport=$("mqtt-transport").value;
 if(!host||!port){log("Vul broker host en poort in.","warn");return;}
 if(transport==="tcp"){fetch("/api/mqtt/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({host,port,username:$("mqtt-user").value,password:$("mqtt-password").value,topic:$("mqtt-topic").value})}).then(async res=>{if(!res.ok)throw new Error(await res.text());$("mqtt-state").textContent="BRIDGE CONNECTED";$("mqtt-connect").disabled=true;$("mqtt-disconnect").disabled=false;log("MQTT TCP bridge verbonden.");}).catch(e=>log("MQTT TCP bridge: "+e.message,"error"));return;}
 const scheme=location.protocol==="https:"?"wss":"ws";const url=`${scheme}://${host}:${port}/mqtt`;
 try{
  state.mqtt=window.mqtt.connect(url,{username:$("mqtt-user").value||undefined,password:$("mqtt-password").value||undefined,clientId:"universal-meter-"+Math.random().toString(16).slice(2),clean:true,connectTimeout:10000,reconnectPeriod:3000});
  state.mqtt.on("connect",()=>{$("mqtt-state").textContent="CONNECTED";$("mqtt-connect").disabled=true;$("mqtt-disconnect").disabled=false;log("MQTT WebSocket verbonden met "+url);});
  state.mqtt.on("reconnect",()=>log("MQTT reconnect…","warn"));state.mqtt.on("error",e=>log("MQTT: "+e.message,"error"));
  state.mqtt.on("close",()=>{$("mqtt-state").textContent="DISCONNECTED";$("mqtt-connect").disabled=false;$("mqtt-disconnect").disabled=true;});
 }catch(e){log(e.message,"error");}
}
function mqttDisconnect(){if(state.mqtt){state.mqtt.end(true);state.mqtt=null;}fetch("/api/mqtt/disconnect",{method:"POST"}).catch(()=>{});$("mqtt-state").textContent="DISCONNECTED";$("mqtt-connect").disabled=false;$("mqtt-disconnect").disabled=true;}
$("connect-btn").addEventListener("click",connectBle);$("disconnect-btn").addEventListener("click",disconnectBle);
document.querySelectorAll("[data-key]").forEach(btn=>{btn.addEventListener("click",()=>sendKey(btn.dataset.key));btn.addEventListener("contextmenu",e=>{e.preventDefault();sendKey(btn.dataset.key,true);});});
$("logging-toggle").addEventListener("click",()=>setLogging(!state.logging));
$("export-csv").addEventListener("click",exportCsv);
$("clear-log").addEventListener("click",()=>{if(!confirm("Alle logregels wissen?"))return;state.log=[];$("log-table").innerHTML='<tr><td colspan="4" class="empty">Nog geen meetgegevens</td></tr>';$("log-count").textContent="0 records";});
$("graph-window").addEventListener("change",updateChart);
$("clear-graph-btn").addEventListener("click",()=>{state.history=[];if(chart){chart.data.datasets[0].data=[];chart.update();}updateStats();});
$("clear-console").addEventListener("click",()=>$("console").replaceChildren());
$("mqtt-connect").addEventListener("click",mqttConnect);$("mqtt-disconnect").addEventListener("click",mqttDisconnect);
setInterval(()=>{if(state.logStarted&&state.logging){const sec=Math.floor((Date.now()-state.logStarted)/1000);$("log-duration").textContent=[Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(n=>String(n).padStart(2,"0")).join(":");}},1000);
initChart();initDb().then(()=>log("IndexedDB gereed.","info")).catch(e=>log("IndexedDB niet beschikbaar: "+e.message,"warn"));
setConnection(false);
if(!window.isSecureContext)log("Let op: Web Bluetooth vereist een secure context (HTTPS of localhost).","warn");
if("serviceWorker"in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("./sw.js").catch(e=>log("PWA worker: "+e.message,"warn"));
log("Universal Multimeter gestart. Verbind de EEVblog 121GW via BLE.");
