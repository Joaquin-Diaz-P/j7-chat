import { expect, it } from 'vitest';
import { defaultAnchor, panelBounds, validAnchor } from '../../src/main/window-geometry.js';
const area = {x:0,y:0,width:1440,height:1000};
it('keeps bottom and center when expanding and returning to compact', () => {
 const anchor=defaultAnchor(area);
 const small=panelBounds(area,anchor,90), large=panelBounds(area,anchor,680);
 expect(small).toEqual({x:460,y:630,width:520,height:90});
 expect(large).toEqual({x:460,y:40,width:520,height:680});
 expect(small.y+small.height).toBe(large.y+large.height);
 expect(panelBounds(area,anchor,90)).toEqual(small);
});
it('clamps at top and on small work areas',()=>{
 expect(panelBounds(area,{x:720,y:400},680).y).toBe(0);
 expect(panelBounds({x:0,y:0,width:400,height:500},{x:20,y:100},680)).toEqual({x:0,y:0,width:400,height:500});
});
it('restores remembered bottom/center and supports another display',()=>{
 expect(panelBounds(area,{x:900,y:900},680)).toEqual({x:640,y:220,width:520,height:680});
 const other={x:-1920,y:200,width:1920,height:1080};
 expect(defaultAnchor(other)).toEqual({x:-960,y:978});
 expect(panelBounds(other,defaultAnchor(other),680)).toEqual({x:-1220,y:298,width:520,height:680});
});

it('history preserves right edge, vertical bounds with a 260px sidebar', () => {
 const anchor=defaultAnchor(area), chat=panelBounds(area,anchor,680), history=panelBounds(area,anchor,680,true);
 expect(history).toEqual({x:200,y:40,width:780,height:680});
 expect(history.x+history.width).toBe(chat.x+chat.width);
 expect(history.y).toBe(chat.y);
 expect(history.height).toBe(chat.height);
 expect(chat.x-history.x).toBe(260);
});
it('history clamps against left edge and preserves bottom', () => {
 const chat=panelBounds(area,{x:300,y:900},680), history=panelBounds(area,{x:300,y:900},680,true);
 expect(history.x).toBe(0);
 expect(history.y+history.height).toBe(chat.y+chat.height);
 expect(history.x+history.width-(chat.x+chat.width)).toBe(220);
});
it('discards anchors outside current display, including nonfinite positions', () => {
 for(const saved of [{x:-1,y:500},{x:1441,y:500},{x:700,y:-1},{x:700,y:1001},{x:NaN,y:10},{x:Infinity,y:10},{x:10,y:-Infinity}]) expect(validAnchor(area,saved)).toBeUndefined();
 expect(validAnchor(area,{x:900,y:900})).toEqual({x:900,y:900});
 expect(validAnchor({x:-1920,y:200,width:1920,height:1080},{x:900,y:900})).toBeUndefined();
});

it('opens history from compact with the same bottom and returns to its bounds', () => {
 const anchor=defaultAnchor(area), compact=panelBounds(area,anchor,90);
 const history=panelBounds(area,anchor,680,true);
 expect(history.y+history.height).toBe(compact.y+compact.height);
 expect(history.width).toBe(780);
 expect(panelBounds(area,anchor,90)).toEqual(compact);
});
it('fits history on a small display and respects negative display coordinates', () => {
 expect(panelBounds({x:0,y:0,width:600,height:500},{x:300,y:400},680,true)).toEqual({x:0,y:0,width:600,height:500});
 const other={x:-1920,y:200,width:1920,height:1080};
 expect(panelBounds(other,{x:-1800,y:1000},680,true)).toEqual({x:-1920,y:320,width:780,height:680});
});

it('uses the composer height plus a symmetric 8px surround', () => {
 expect(panelBounds(area,defaultAnchor(area),74+16).height).toBe(90);
 expect(panelBounds(area,defaultAnchor(area),120+16).height).toBe(136);
 expect(panelBounds(area,defaultAnchor(area),0).height).toBe(90);
});

import { canvasBounds, canvasAnchor } from '../../src/main/window-geometry.js';
it('reserves the same maximum canvas for every card state and keeps saved anchors', () => {
 const anchor={x:900,y:900};
 const bounds=canvasBounds(area,anchor);
 expect(bounds).toEqual({x:356,y:196,width:828,height:728});
 expect(canvasAnchor(bounds)).toEqual(anchor);
 for(const _state of ['compact','expanded','history','selector']) expect(canvasBounds(area,anchor)).toEqual(bounds);
});
it('clamps the entire canvas on all edges and other displays', () => {
 for(const anchor of [{x:0,y:0},{x:1440,y:1000}]) {
  const b=canvasBounds(area,anchor);
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x+b.width).toBeLessThanOrEqual(1440);expect(b.y+b.height).toBeLessThanOrEqual(1000);
 }
 expect(canvasBounds({x:-600,y:200,width:600,height:500},{x:-300,y:400})).toEqual({x:-600,y:200,width:600,height:500});
});

import { cardLayout } from '../../src/main/window-geometry.js';
it('lets the compact card reach the top and left while keeping its anchor on expansion', () => {
 const area={x:0,y:0,width:1440,height:900}, anchor={x:260,y:106};
 const compact=cardLayout(area,anchor,106);
 expect(compact.card).toEqual({x:0,y:0,width:520,height:106});
 expect(compact.offset.y).toBeLessThan(0);
 const expanded=cardLayout(area,anchor,680,true);
 expect(expanded.card).toEqual({x:0,y:0,width:780,height:680});
 expect(cardLayout(area,{x:800,y:800},680,true).card).toEqual({x:280,y:120,width:780,height:680});
});
it('fits a small display and supports a display with negative coordinates', () => {
 const small=cardLayout({x:0,y:0,width:500,height:600},{x:260,y:90},680,true);
 expect(small.card.width).toBe(452);
 expect(small.card.height).toBe(552);
 const other=cardLayout({x:-1440,y:-900,width:1440,height:900},{x:-800,y:-100},680,true);
 expect(other.card).toEqual({x:-1320,y:-780,width:780,height:680});
});
