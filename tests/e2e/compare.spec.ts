import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("compare picker, independent columns, restart persistence and cancellation", async () => {
  const data = await mkdtemp(join(tmpdir(), "j7-compare-e2e-"));
  await writeFile(join(data,"settings.json"), JSON.stringify({firstRunDone:true}));
  const env: Record<string,string> = {...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === "string")),J7_MOCK:"1",J7_TEST:"1",J7_DATA_DIR:data};
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({args:["."],env});
  try {
    await app.evaluate(() => (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
    let page = await app.firstWindow();
    await page.evaluate(() => window.j7.setPinned(true));
    await expect.poll(() => page.evaluate(async () => (await window.j7.snapshot()).catalog?.models.length)).toBe(2);
    // Compare lives in the model selector sidebar, under the favorites star, not in the composer.
    await expect(page.locator(".composer-tools").getByRole("button",{name:"Comparar modelos",exact:true})).toHaveCount(0);
    await page.locator(".model-trigger").click();
    const sidebar = page.locator(".model-sidebar");
    await expect(sidebar.locator("button").nth(1)).toHaveAccessibleName("Comparar modelos");
    await sidebar.getByRole("button",{name:"Comparar modelos",exact:true}).click();
    const picker = page.getByRole("dialog",{name:"Comparar respuestas"});
    await expect(picker.getByRole("checkbox")).toHaveCount(2);
    await expect(picker.getByRole("checkbox").first()).toBeChecked();
    await expect(picker.getByRole("checkbox").last()).toBeChecked();
    await picker.getByRole("button",{name:"Usar comparación"}).click();
    await expect(picker).toHaveCount(0);
    await expect(page.locator(".model-trigger")).toHaveText("Comparar · 2");
    await page.locator(".composer textarea").fill("/echo-context same question");
    await page.getByRole("button",{name:"Enviar",exact:true}).click();
    await expect(page.locator(".comparison-grid .assistant-message")).toHaveCount(2);
    await expect.poll(() => page.evaluate(async () => (await window.j7.snapshot()).active)).toBe(false);
    const before = await page.evaluate(() => window.j7.snapshot());
    expect(before.messages.filter(message => message.role === "user")).toHaveLength(1);
    expect(before.messages.filter(message => message.role === "assistant").map(message => message.text)).toEqual(["/echo-context same question","/echo-context same question"]);
    await expect(page.getByRole("region",{name:"Respuestas de la comparación"})).toHaveAttribute("tabindex","0");
    await app.close();

    app = await electron.launch({args:["."],env});
    await app.evaluate(() => (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
    page = await app.firstWindow();
    await page.evaluate(() => window.j7.setPinned(true));
    await page.locator(".composer textarea").press("Meta+b");
    await expect(page.locator(".history-row")).toHaveCount(1);
    await page.locator(".history-row > button").first().click();
    await expect(page.locator(".comparison-grid .assistant-message")).toHaveCount(2);
    await expect.poll(() => page.evaluate(async () => (await window.j7.snapshot()).compareModels)).toEqual(["mock-a:mock-a","mock-b:mock-b"]);
    expect((await page.evaluate(() => window.j7.snapshot())).messages).toEqual(before.messages);
    await page.locator(".composer textarea").fill("/slow");
    await page.getByRole("button",{name:"Enviar",exact:true}).click();
    await page.getByRole("button",{name:"Detener",exact:true}).click();
    await expect.poll(() => page.evaluate(async () => (await window.j7.snapshot()).active)).toBe(false);
    expect((await page.evaluate(() => window.j7.snapshot())).messages.slice(-2).map(message => message.status)).toEqual(["stopped","stopped"]);
  } finally { await app.close(); await rm(data,{recursive:true,force:true}); }
});
