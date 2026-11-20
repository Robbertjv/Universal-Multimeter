export const SERVICE_UUID = "0bd51666-e7cb-469b-8e4d-2742f1ba77cc";
export const DATA_CHARACTERISTIC_UUID = "e7add780-b042-4876-aae1-112855353cc1";
export const PACKET_LENGTH = 19;
const START = 0xf2;

const MODES = [
  {name:"Low-Z voltage",unit:"V",digits:[4],prefix:" "},
  {name:"DC voltage",unit:"V",digits:[1,2,3,4],prefix:"    "},
  {name:"AC voltage",unit:"V",digits:[1,2,3,4],prefix:"    "},
  {name:"DC millivolts",unit:"V",digits:[2,3],prefix:"mm"},
  {name:"AC millivolts",unit:"V",digits:[2,3],prefix:"mm"},
  {name:"Temperature",unit:"°C",digits:[4],prefix:" "},
  {name:"Frequency",unit:"Hz",digits:[2,3,1,2,3],prefix:"  kkk"},
  {name:"Pulse width",unit:"s",digits:[1,2,3],prefix:"   ",implied:"m"},
  {name:"Duty cycle",unit:"%",digits:[4],prefix:" "},
  {name:"Resistance",unit:"Ω",digits:[2,3,1,2,3,1,2],prefix:"  kkkMM"},
  {name:"Continuity",unit:"Ω",digits:[3],prefix:" "},
  {name:"Diode",unit:"V",digits:[1,2],prefix:"  "},
  {name:"Capacitance",unit:"F",digits:[3,4,2,3,4,5],prefix:"nnuuuu"},
  {name:"AC power",unit:"VA",digits:[3,4,4,5],prefix:"    ",implied:"u"},
  {name:"AC power",unit:"VA",digits:[2,3,3,4],prefix:"mm  "},
  {name:"AC power",unit:"VA",digits:[4,5,2,3],prefix:"mm  "},
  {name:"AC current",unit:"A",digits:[2,3],prefix:"  ",implied:"u"},
  {name:"DC current",unit:"A",digits:[2,3],prefix:"  ",implied:"u"},
  {name:"AC current",unit:"A",digits:[1,2],prefix:"mm"},
  {name:"DC current",unit:"A",digits:[1,2],prefix:"mm"},
  {name:"AC current",unit:"A",digits:[3,1,2],prefix:"m  "},
  {name:"DC current",unit:"A",digits:[3,1,2],prefix:"m  "},
  {name:"DC power",unit:"VA",digits:[3,4,4,5],prefix:"    ",implied:"u"},
  {name:"DC power",unit:"VA",digits:[2,3,3,4],prefix:"mm  "},
  {name:"DC power",unit:"VA",digits:[4,5,2,3],prefix:"mm  "},
  {name:"Temperature",unit:"°C",digits:[4],prefix:" "},
  {name:"Temperature",unit:"°F",digits:[4],prefix:" "}
];
const PREFIX = {n:1e-9,u:1e-6,m:1e-3," ":1,k:1e3,M:1e6};
const SYMBOL = {n:"n",u:"µ",m:"m"," ":"",k:"k",M:"M"};
const SUB_LABELS = {100:"Meter temperature",105:"Meter temperature",110:"Battery",120:"Auto power-off: on",125:"Auto power-off: off",130:"Year",135:"Date",140:"Time",150:"Burden voltage",156:"Burden voltage",160:"LCD contrast",180:"dBm",190:"Logging interval"};

export function checksum(bytes) {
  let value = 0;
  for (const byte of bytes) value ^= byte;
  return value;
}

export function parsePacket(frame, receivedAt = Date.now(), previousSubLabel = null) {
  if (frame.length !== PACKET_LENGTH || frame[0] !== START || checksum(frame.slice(0,18)) !== frame[18]) return null;
  const b = frame;
  let mode = b[5] & 0x1f;
  const mainFlags = b[6];
  if (mode === 5 && (mainFlags & 0x20)) mode = 25;
  else if (mode === 5 && (mainFlags & 0x10)) mode = 26;
  const info = MODES[mode];
  const range = mainFlags & 0x0f;
  const mainRaw = (((b[5] >> 6) & 3) << 16) | (b[7] << 8) | b[8];
  const overload = !!(mainFlags & 0x80);
  const negative = !!(mainFlags & 0x40);
  let mainText = overload ? "OFL" : String(mainRaw).padStart(5," ");
  let mainUnit = "";
  let value = null;
  let baseValue = null;
  let baseUnit = info?.unit || "";
  let modeName = info?.name || `Mode ${mode}`;
  if (info && range < info.digits.length) {
    const integerDigits = info.digits[range];
    const prefix = info.prefix[range] !== " " ? info.prefix[range] : (info.implied || " ");
    mainUnit = (SYMBOL[prefix] || "") + info.unit;
    if (!overload) {
      const rawText = String(mainRaw).padStart(5," ");
      const splitAt = rawText.length - (5 - integerDigits);
      mainText = integerDigits >= 5 ? rawText : `${rawText.slice(0,splitAt).trimStart() || "0"}.${rawText.slice(splitAt).replaceAll(" ","0")}`;
      const magnitude = mainRaw / Math.pow(10, 5 - integerDigits);
      value = negative ? -magnitude : magnitude;
      baseValue = value * (PREFIX[prefix] ?? 1);
    }
  }
  if (mode === 25) mainUnit = "°C";
  if (mode === 26) mainUnit = "°F";
  if (mode === 25 || mode === 26) baseUnit = mainUnit;

  const subMode = b[9];
  const subFlags = b[10];
  const subRaw = (b[11] << 8) | b[12];
  const subDecimals = subFlags & 7;
  const subOverload = !!(subFlags & 0x80);
  const subNegative = !!(subFlags & 0x40);
  let subLabel = SUB_LABELS[subMode] || null;
  if (subMode === 0) subLabel = previousSubLabel === "Buzzer" || previousSubLabel?.startsWith("Auto power-off") ? "Buzzer" : "Meter ID / interval";
  let subUnit = "";
  if ([0,1,2,3,4,5,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26].includes(subMode)) {
    const units = {0:"V",1:"V",2:"V",3:"mV",4:"mV",5:(b[16]&0x80)?"°F":"°C",9:"Ω",10:"Ω",11:"V",12:"F",13:"VA",14:"VA",15:"VA",16:"A",17:"A",18:"A",19:"A",20:"A",21:"A",22:"VA",23:"VA",24:"VA",25:"°C",26:"°F"};
    subUnit = units[subMode] || "";
    if (b[10] & 0x20) subUnit = "k" + subUnit;
  } else if (subMode === 6) subUnit = "Hz";
  else if (subMode === 7) subUnit = "ms";
  else if (subMode === 8) subUnit = "%";
  else if (subMode === 110 || subMode === 150 || subMode === 156) subUnit = "V";
  else if (subMode === 180) subUnit = "dBm";
  else if (subMode === 190) subUnit = "ms";
  const subDigits = String(subRaw).padStart(subDecimals + 1,"0");
  const subText = subOverload ? "OFL" : subDecimals ? subDigits.slice(0,-subDecimals) + "." + subDigits.slice(-subDecimals) : String(subRaw);
  if (subMode === 120) { /* page text is more useful than the numeric value */ }
  if (subMode === 125) { /* page text is more useful than the numeric value */ }

  const barOn = !(b[13] & 0x10);
  const barValue = b[14] & 0x1f;
  const mainOverload = overload;
  const coupling = (b[15] >> 3) & 3;
  const icons = {
    ac: coupling === 2 || coupling === 3 || !!(b[17] & 2),
    dc: coupling === 1 || coupling === 3 || !!(b[17] & 1),
    auto: !!(b[15] & 4), apo: !!(b[15] & 2), lowBattery: !!(b[15] & 1),
    bluetooth: !!(b[16] & 0x40), relative: !!(b[16] & 0x10), decibels: !!(b[16] & 8),
    minMax: b[16] & 7, test: !!(b[17] & 0x40), memory: (b[17] >> 4) & 3,
    hold: (b[17] >> 2) & 3, lowPass: !!(b[15] & 0x40), peak: !!(b[15] & 0x20),
    arrow: !!(b[16] & 0x20), coupling
  };
  const serial = (b[2]&15)*10000 + (b[3]>>4)*1000 + (b[3]&15)*100 + (b[4]>>4)*10 + (b[4]&15);
  const sub = {mode:subMode,label:subLabel,text:subText,unit:subUnit,negative:subNegative,overload:subOverload,raw:subRaw,decimals:subDecimals};
  return {
    receivedAt, raw:Array.from(b), serial, year:b[1]+2000, month:b[2]>>4, mode, modeName,
    main:{text:mainText,unit:mainUnit,value,baseValue,baseUnit,negative,overload},
    sub, bar:{on:barOn,segments:barOn?(mainOverload?26:Math.min(26,barValue+1)):0,negative:!!(b[13]&4),scale:[5,50,500,1000][b[13]&3],ticks150:!!(b[13]&8)},
    icons, batteryVoltage:subMode===110&&!subOverload?subRaw/Math.pow(10,subDecimals):null
  };
}

export class PacketFramer {
  constructor(){this.buffer=[];this.invalid=0;}
  push(input){
    this.buffer.push(...input);
    if(this.buffer.length>1024)this.buffer=this.buffer.slice(-19);
    const packets=[];
    let start=0;
    while(true){
      start=this.buffer.indexOf(START,start);
      if(start<0){this.buffer=[];break;}
      if(this.buffer.length-start<19){this.buffer=this.buffer.slice(start);break;}
      const candidate=this.buffer.slice(start,start+19);
      if(checksum(candidate.slice(0,18))===candidate[18]){
        packets.push(candidate);start+=19;
      }else{this.invalid++;start++;}
    }
    return packets;
  }
  reset(){this.buffer=[];this.invalid=0;}
}

export function makeKeyPacket(keyNumber,longPress=false){
  const key=String(keyNumber);
  if(!/^[1-8]$/.test(key))throw new Error("Ongeldige 121GW-knop.");
  const press=longPress?"8":"0";
  return new Uint8Array([0xf4,press.charCodeAt(0),key.charCodeAt(0),press.charCodeAt(0),key.charCodeAt(0)]);
}
