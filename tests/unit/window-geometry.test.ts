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
it('clamps the entire canvas on all edges and other displays', () => {
 for(const anchor of [{x:0,y:0},{x:1440,y:1000}]) {
  const b=canvasBounds(area,anchor);
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x+b.width).toBeLessThanOrEqual(1440);expect(b.y+b.height).toBeLessThanOrEqual(1000);
 }
 expect(canvasBounds({x:-600,y:200,width:600,height:500},{x:-300,y:400})).toEqual({x:-600,y:200,width:600,height:500});
});

import { cardLayout } from '../../src/main/window-geometry.js';
it('keeps the compact card within the shadow margin near the top and left and keeps its anchor on expansion', () => {
 const area={x:0,y:0,width:1440,height:900}, anchor={x:260,y:106};
 const compact=cardLayout(area,anchor,106);
 expect(compact.card).toEqual({x:24,y:24,width:520,height:106});
 expect(compact.offset.y).toBeLessThan(0);
 const expanded=cardLayout(area,anchor,680,true);
 expect(expanded.card).toEqual({x:24,y:24,width:780,height:680});
 expect(cardLayout(area,{x:800,y:800},680,true).card).toEqual({x:280,y:120,width:780,height:680});
});
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
   expect(card.y-canvas.y).toBeGreaterThanOrEqual(24);
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
it('rejects invalid saved anchors and accepts negative display coordinates', () => {
 for(const saved of [{x:-1,y:500},{x:1441,y:500},{x:700,y:-1},{x:700,y:1001},{x:NaN,y:10},{x:Infinity,y:10}]) expect(validAnchor(area,saved)).toBeUndefined();
 const other={x:-1920,y:200,width:1920,height:1080};
 expect(validAnchor(other,{x:-960,y:978})).toEqual({x:-960,y:978});
});
