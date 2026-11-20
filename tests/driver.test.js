import test from "node:test";
import assert from "node:assert/strict";
import {checksum,parsePacket,PacketFramer,makeKeyPacket} from "../js/drivers/eevblog-121gw.js";
function packet({mode=1,range=1,raw=12345,subMode=0,subRaw=0,subDecimals=0,status1=0x04,status2=0x40,status3=0}={}){
 const b=new Uint8Array(19);b[0]=0xf2;b[1]=24;b[2]=0x11;b[3]=0x23;b[4]=0x45;
 b[5]=(mode&31)|(((raw>>16)&3)<<6);b[6]=range&15;b[7]=(raw>>8)&255;b[8]=raw&255;
 b[9]=subMode;b[10]=subDecimals&7;b[11]=(subRaw>>8)&255;b[12]=subRaw&255;b[13]=0x10;b[14]=5;b[15]=status1;b[16]=status2;b[17]=status3;b[18]=checksum(b.slice(0,18));return b;
}
test("XOR checksum covers packet payload",()=>{const p=packet();assert.equal(checksum(p.slice(0,18)),p[18]);});
test("decoder reads 12.345 V from DC voltage range 1",()=>{const r=parsePacket(packet());assert.equal(r.main.text.trim(),"12.345");assert.equal(r.main.unit,"V");assert.equal(r.main.value,12.345);assert.equal(r.serial,12345);});
test("decoder applies negative sign and overload",()=>{const p=packet();p[6]|=0x40;p[18]=checksum(p.slice(0,18));assert.equal(parsePacket(p).main.value,-12.345);p[6]|=0x80;p[18]=checksum(p.slice(0,18));assert.equal(parsePacket(p).main.text,"OFL");});
test("framer handles split and concatenated packets",()=>{const a=packet(),b=packet({mode:9,range:2});const f=new PacketFramer();assert.equal(f.push(a.slice(0,8)).length,0);assert.equal(f.push(new Uint8Array([...a.slice(8),...b])).length,2);});
test("framer rejects checksum corruption",()=>{const p=packet();p[8]^=1;const f=new PacketFramer();assert.equal(f.push(p).length,0);assert.equal(f.invalid,1);});
test("key frame matches documented five-byte format",()=>{assert.deepEqual([...makeKeyPacket(2)],[0xf4,0x30,0x32,0x30,0x32]);assert.deepEqual([...makeKeyPacket(8,true)],[0xf4,0x38,0x38,0x38,0x38]);});
test("decoder refuses unknown range scaling",()=>{assert.equal(parsePacket(packet({mode:1,range:14})).main.value,null);});
