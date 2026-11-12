import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HexIcon, ProviderIcon } from "../../src/renderer/components/ProviderIcon.js";
it("N9 renders the brand SVG and mock flask",()=>{
 for(const provider of ["codex","claude","gemini","opencode","mock-a"] as const){
  const html=renderToStaticMarkup(createElement(ProviderIcon,{provider}));
  expect(html).toContain(`data-provider="${provider}"`);
  // Antigravity uses T3 Code's raster artwork; every other provider is an inline SVG.
  expect(html).toContain(provider==="gemini" ? "<img" : "<svg");
  if(provider==="claude")expect(html).toContain("#D97757");
  if(provider==="mock-a")expect(html).toContain("flask-conical");
 }
});
it("Hex has its own icon without the app tile",()=>{
 const html=renderToStaticMarkup(createElement(HexIcon,{size:34}));
 expect(html).toContain('stroke="currentColor"');
 expect(html).not.toContain("<rect");
});
