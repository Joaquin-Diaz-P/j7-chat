import { expect, it } from 'vitest';
import { defaultAnchor, validAnchor } from '../../src/main/window-geometry.js';
const area = {x:0,y:0,width:1440,height:1000};
import { canvasBounds, canvasAnchor } from '../../src/main/window-geometry.js';
it('reserves the same maximum canvas for every card state and keeps saved anchors', () => {
 const anchor={x:900,y:900};
 const bounds=canvasBounds(area,anchor);
 expect(bounds).toEqual({x:356,y:196,width:828,height:728});
 expect(canvasAnchor(bounds)).toEqual(anchor);
 for(const _state of ['compact','expanded','history','selector']) expect(canvasBounds(area,anchor)).toEqual(bounds);
});

import { cardLayout } from '../../src/main/window-geometry.js';
it('fits a small display and supports a display with negative coordinates', () => {
 const small=cardLayout({x:0,y:0,width:500,height:600},{x:260,y:90},680,true);
 expect(small.card.width).toBe(452);
 expect(small.card.height).toBe(552);
 const other=cardLayout({x:-1440,y:-900,width:1440,height:900},{x:-800,y:-100},680,true);
 expect(other.card).toEqual({x:-1320,y:-780,width:780,height:680});
});

it('reserves shadow space on every edge, including bottom right', () => {
 for (const anchor of [{x:0,y:0},{x:1440,y:1000}]) {
  for (const history of [false,true]) {
   const {card,canvas}=cardLayout(area,anchor,680,history);
   expect(card.x-canvas.x).toBeGreaterThanOrEqual(24);
   // Only a card touching the top of the screen gives up its top shadow margin.
   expect(card.y-canvas.y).toBeGreaterThanOrEqual(card.y===area.y ? 0 : 24);
   expect(canvas.x+canvas.width-card.x-card.width).toBeGreaterThanOrEqual(24);
   expect(canvas.y+canvas.height-card.y-card.height).toBeGreaterThanOrEqual(24);
  }
 }
});
it('preserves the bottom and right edge across states away from screen edges', () => {
 const anchor=defaultAnchor(area);
 const compact=cardLayout(area,anchor,106).card;
 for(const history of [false,true]) {
  const expanded=cardLayout(area,anchor,680,history).card;
  expect(expanded.y+expanded.height).toBe(compact.y+compact.height);
  expect(expanded.x+expanded.width).toBe(compact.x+compact.width);
 }
});

it('lets the card leave the screen sideways and downwards, like a macOS window', () => {
 const far={left:{x:-3000,y:500},right:{x:5000,y:500},down:{x:700,y:5000},up:{x:700,y:-500}};
 for(const history of [false,true]) {
  // The wide history card overhangs only as far as the compact card would.
  expect(cardLayout(area,far.left,106,history).card.x).toBe(80-520);
  expect(cardLayout(area,far.right,106,history).card.x).toBe(1440-80);
  expect(cardLayout(area,far.down,106,history).card.y).toBe(1000-60);
  // Never under the menu bar, even when the card grows upwards.
  expect(cardLayout(area,far.up,680,history).card.y).toBe(0);
  for(const anchor of Object.values(far)) {
   const {card,canvas}=cardLayout(area,anchor,106,history);
   // The window never rises above the work area: macOS would stop it there.
   expect(canvas.y).toBeGreaterThanOrEqual(area.y);
   expect(card.y).toBeGreaterThanOrEqual(canvas.y);
   expect(card.x-canvas.x).toBeGreaterThanOrEqual(24);
   expect(canvas.y+canvas.height-card.y-card.height).toBeGreaterThanOrEqual(24);
  }
  // At the top the compact card reaches the screen's edge inside a canvas pinned to it.
  const top=cardLayout(area,far.up,106,history);
  expect(top.canvas.y).toBe(0); expect(top.card.y).toBe(0); expect(top.offset.y).toBeLessThan(0);
 }
});
it('keeps the remembered bottom-right edge on expansion and places the card on another display', () => {
 const area={x:0,y:0,width:1440,height:900};
 expect(cardLayout(area,{x:260,y:106},106).card).toEqual({x:0,y:0,width:520,height:106});
 expect(cardLayout(area,{x:260,y:106},680,true).card).toEqual({x:0,y:0,width:780,height:680});
 expect(cardLayout(area,{x:800,y:800},680,true).card).toEqual({x:280,y:120,width:780,height:680});
 const other={x:1440,y:0,width:1920,height:1080};
 expect(cardLayout(other,{x:1500,y:600},106).card).toEqual({x:1500-260+260-520+260,y:494,width:520,height:106});
});
it('accepts saved anchors partly off the display and rejects ones that left it', () => {
 for(const saved of [{x:-261,y:500},{x:1701,y:500},{x:700,y:-1},{x:700,y:1107},{x:NaN,y:10},{x:Infinity,y:10}]) expect(validAnchor(area,saved)).toBeUndefined();
 expect(validAnchor(area,{x:-200,y:1050})).toEqual({x:-200,y:1050});
 const other={x:-1920,y:200,width:1920,height:1080};
 expect(validAnchor(other,{x:-960,y:978})).toEqual({x:-960,y:978});
});

import { resizeCard } from '../../src/main/window-geometry.js';
it('grows its canvas beyond the old limit while retaining the card anchor',()=>{
 const anchor={x:1000,y:900};
 const {card,canvas}=cardLayout(area,anchor,680,true,{width:1100,height:850});
 expect(card.width).toBe(1100);expect(card.height).toBe(850);
 expect(canvas.width).toBe(1148);expect(canvas.height).toBe(898);
 expect(card.x+card.width).toBe(anchor.x+260);expect(card.y+card.height).toBe(anchor.y);
});
it('resizes all eight edges against their opposite edge and clamps to the work area and minima',()=>{
 const start={x:100,y:100,width:900,height:750};
 for(const edge of ['n','s','e','w','ne','nw','se','sw']) {
  const card=resizeCard(start,area,edge,30,20,false);
  expect(card.x).toBe(edge.includes('w')?130:100);
  expect(card.y).toBe(edge.includes('n')?120:100);
  expect(card.x+card.width).toBe(edge.includes('e')?1030:1000);
  expect(card.y+card.height).toBe(edge.includes('s')?870:850);
 }
 expect(resizeCard(start,area,'se',-900,-900,false)).toEqual({...start,width:520,height:680});
 expect(resizeCard(start,area,'se',900,900,true)).toEqual({...start,width:1340,height:900});
});

it('resizing a partly offscreen card keeps its minimum size and brings it into the work area',()=>{
 const result=resizeCard({x:1400,y:950,width:780,height:680},area,'s',0,20,true);
 expect(result.width).toBeGreaterThanOrEqual(780);expect(result.height).toBeGreaterThanOrEqual(680);
 expect(result.x+result.width).toBeLessThanOrEqual(1440);expect(result.y+result.height).toBeLessThanOrEqual(1000);
});
