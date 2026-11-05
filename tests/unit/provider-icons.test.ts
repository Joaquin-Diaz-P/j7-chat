import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderIcon } from "../../src/renderer/components/ProviderIcon.js";
it("N9 renders the brand SVG and mock flask",()=>{
 for(const provider of ["codex","claude","opencode","mock-a"] as const){
  const html=renderToStaticMarkup(createElement(ProviderIcon,{provider}));
  expect(html).toContain(`data-provider="${provider}"`);
  expect(html).toContain("<svg");
  if(provider==="claude")expect(html).toContain("#D97757");
  if(provider==="mock-a")expect(html).toContain("flask-conical");
 }
});
