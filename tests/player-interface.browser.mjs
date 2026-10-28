/** Real exported-app interaction tests. Run pnpm build:web, install Chromium,
 * then pnpm test:ui. UI screenshots are layout evidence only. */
import test from "node:test";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve("dist");
const base = process.env.INFIPET_BASE_URL || "";
const contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith(base + "/")) {
      res.writeHead(404).end();
      return;
    }
    const relative =
      pathname.slice(base.length).replace(/^\//, "") || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        contentTypes[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}${base}/`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: process.env.CHROMIUM_EXECUTABLE_PATH
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [],
});
const parts = [
  "Body",
  "Head",
  "Arm",
  "Hand",
  "Leg",
  "Foot",
  "Eye",
  "Mouth",
  "Ear",
  "Tail",
  "Wing",
  "Horn",
  "Egg",
  "Hair",
  "Details",
];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("infipet.pet")));
const livingIdentity = (doc) => ({
  parts: doc.life.parts,
  seed: doc.life.seed,
  birth: doc.life.game.clock.startedAtMs,
});
async function saved(page, predicate) {
  await page.waitForFunction((fn) => {
    const doc = JSON.parse(localStorage.getItem("infipet.pet"));
    return doc && new Function("doc", `return (${fn})(doc)`)(doc);
  }, predicate.toString());
  return stored(page);
}
async function openTools(page) {
  const toggle = button(page, "Enable development tools");
  if (await toggle.count()) await toggle.click();
  await page
    .getByRole("complementary", { name: "Development tools panel" })
    .waitFor();
}

const errors = [];
try {

  for (const viewport of [
    {width:320,height:640},{width:360,height:640},
    {width:375,height:667},{width:390,height:640},
    {width:393,height:640},{width:414,height:736},{width:430,height:780}
  ]) {
    await test(`mobile device rail and birth action at ${viewport.width}×${viewport.height}`,async()=>{
      const context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
      const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
      await page.goto(url);
      const device=await page.locator("#infipet-device").boundingBox();
      assert.ok(device,"device exists");
      assert.ok(device.width>=viewport.width-26,"device uses full available width");
      assert.ok(device.x>=0&&device.x+device.width<=viewport.width+1,"device does not overflow");
      const birth=await button(page,"Begin life").boundingBox();
      assert.ok(birth&&birth.height>=44&&birth.y+birth.height<=viewport.height+1,
        "mobile birth command is visible above browser content edge without scrolling");
      // The default anatomy UI has only three controls, without a huge
      // fifteen-name grid occupying most of a mobile viewport.
      for(const label of ["Previous body part","Choose body part","Next body part"]){
        const b=await button(page,label).boundingBox();
        assert.ok(b&&b.width>=44&&b.height>=44,`44px touch target: ${label}`);
      }
      assert.equal(await button(page,"Draw body").count(),0,"full grid is collapsed initially");
      const xOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      assert.equal(xOverflow,false,"no page-wide horizontal scrolling");
      if(viewport.width===390){
        const before=await page.locator("#infipet-device").boundingBox();
        const canvas=await page.getByLabel("Draw your whole pet here",{exact:true}).boundingBox();
        assert.ok(canvas.width<=before.width-24,"canvas uses available width without squeezing device");
        await page.setViewportSize({width:390,height:500});
        const after=await page.locator("#infipet-device").boundingBox();
        assert.equal(Math.round(before.width),Math.round(after.width),
          "shell width independent of Safari bar height");
        const canvasAfter=await page.getByLabel("Draw your whole pet here",{exact:true}).boundingBox();
        assert.ok(canvasAfter.width<=canvas.width,"canvas alone adapts");
        const birthAfter=await button(page,"Begin life").boundingBox();
        assert.ok(birthAfter.y+birthAfter.height<=501,"birth survives shortened viewport");
      }
      await context.close();
    });
  }
  for (const viewport of [
    { width: 1280, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await test(`draw-first canvas and all 15 one-tap parts at ${viewport.width}px`, async () => {
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.width < 500,
        isMobile: viewport.width < 500,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      const canvas = page.getByLabel("Draw your whole pet here", {
        exact: true,
      });
      await canvas.waitFor();
      assert.equal(
        await button(page, "Close panel").count(),
        0,
        "fresh start has no modal",
      );
      assert.equal(await button(page, "Return to your pet").count(), 0,
        "do not show a redundant disabled Pet tab before birth");
      assert.equal(await button(page, "Open more menu").count(), 1);
      for (const tool of ["Use pencil","Use eraser","Choose brush color","Learn about body"]){
        const control=button(page,tool);
        assert.equal(await control.isVisible(),true);
        assert.equal(await control.locator("svg").count(),tool==="Choose brush color"?0:1,
          "use legible pixel glyphs instead of text-dominated buttons");
      }
      assert.equal(await button(page,"Watch your pet explore").count(),0,
        "unsupported locomotion must not leave a permanently disabled walk icon");
      assert.equal(await button(page, "Begin life").isDisabled(), true);
      // Current selected anatomical symbol and two navigation arrows.
      for(const label of ["Previous body part","Choose body part","Next body part"])
        assert.ok(await button(page,label).isVisible());
      assert.equal(await button(page,"Draw head").count(),0);
      await button(page,"Choose body part").click();
      for (const name of parts) {
        const part=button(page,`Draw ${name.toLowerCase()}`);
        assert.equal(await part.isVisible(),true);
        const box=await part.boundingBox();
        assert.ok(box.width>=44&&box.height>=44,`usable symbol target: ${name}`);
        assert.equal(await part.getByText(name,{exact:true}).count(),0,
          "anatomical buttons have accessible names without printed labels");
      }
      const bounds=await Promise.all(parts.map(name=>
        button(page,`Draw ${name.toLowerCase()}`).boundingBox()));
      assert.equal(new Set(bounds.map(b=>Math.round(b.y))).size,3,
        "expanded palette uses three compact rows of 5 symbols");
      assert.equal(new Set(bounds.map(b=>Math.round(b.x))).size,5);
      assert.ok(bounds.every(b=>b.x>=0&&b.x+b.width<=viewport.width));
      await button(page,"Draw body").click();
      assert.equal(await button(page,"Choose body part").getByText("Body",{exact:true}).count(),1,
        "the selected material is named once to clarify an ambiguous glyph");
      assert.equal(await button(page,"Draw head").count(),0,
        "choosing a symbol automatically closes the optional grid");
      const c = await canvas.boundingBox();
      if (viewport.width < 500)
        await canvas.tap({
          position: { x: c.width * 0.45, y: c.height * 0.5 },
        });
      else await page.mouse.click(c.x + c.width * 0.45, c.y + c.height * 0.5);
      await saved(page, (doc) =>
        doc.parts.some((p) => p.kind === "body" && p.pixels.length),
      );
      const first = (await stored(page)).parts;
      await button(page, "Next body part").click();
      if (viewport.width < 500)
        await canvas.tap({ position: { x: c.width * 0.5, y: c.height * 0.4 } });
      else await page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.4);
      await saved(page, (doc) =>
        doc.parts.some((p) => p.kind === "head" && p.pixels.length),
      );
      const next = (await stored(page)).parts;
      for (const p of first)
        assert.deepEqual(
          next.find((n) => n.id === p.id),
          p,
          "switching brushes retains existing ink",
        );
      if (process.env.UI_EVIDENCE_DIR && viewport.width !== 320) {
        await mkdir(process.env.UI_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(
            process.env.UI_EVIDENCE_DIR,
            viewport.width > 500 ? "desktop.png" : "narrow.png",
          ),
          fullPage: true,
        });
      }
      await context.close();
    });
  }
  for (const viewport of [
    { width: 1280, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await test(`author-style corner toggle and isolated left tools at ${viewport.width}px`, async () => {
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.width < 500,
        isMobile: viewport.width < 500,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      const off = button(page, "Enable development tools");
      await off.waitFor();
      assert.equal(await off.getAttribute("aria-pressed"), "false");
      const toggleBox = await off.boundingBox();
      assert.ok(
        Math.abs(viewport.width - toggleBox.x - toggleBox.width - 8) < 1,
      );
      assert.ok(Math.abs(toggleBox.y - 6) < 1);
      assert.ok(
        Math.abs(toggleBox.width - (viewport.width >= 1000 ? 27.2 : 44)) < 1,
      );
      assert.equal(
        await page
          .getByRole("complementary", { name: "Development tools panel" })
          .count(),
        0,
      );
      await button(page, "Open more menu").click();
      assert.equal(
        await button(page, "Open Development Tools").count(),
        0,
        "developer entry removed from More",
      );
      await button(page, "Close panel").click();
      await button(page, "Close panel").waitFor({ state: "hidden" });
      if (viewport.width < 500) await off.tap();
      else await off.click();
      const panel = page.getByRole("complementary", {
        name: "Development tools panel",
      });
      await panel.waitFor();
      assert.equal(
        await button(page, "Preview player experience").getAttribute(
          "aria-pressed",
        ),
        "true",
      );
      const bounds = await panel.boundingBox();
      assert.equal(bounds.x, 0);
      assert.equal(bounds.y, 0);
      assert.equal(Math.round(bounds.height), viewport.height);
      assert.equal(
        Math.round(bounds.width),
        viewport.width >= 1000
          ? Math.round(viewport.width * 0.28)
          : viewport.width,
      );
      assert.equal(
        await button(page, "Close panel").count(),
        0,
        "tools live in the dock, not a modal",
      );
      for (const label of [
        "Apply seed",
        "Randomize seed",
        "Open growth timeline and diagnostics",
        "Inspect development and need influences",
        "Home Screen widget",
        "New empty drawing",
        "Rest",
        "Go exploring",
        "Play ball",
        "Say hello",
        "Groom your pet",
      ])
        assert.equal(
          await panel.getByRole("button", { name: label, exact: true }).count(),
          1,
          `${label} is inside the dock`,
        );
      assert.equal(
        await panel.getByRole("button", { name: /^Load .* starter creature/ }).count(),
        0,
        "starter drawings belong to player authoring, not the developer dock",
      );
      assert.equal(await panel.getByRole("button", {name:"Expand morphology workbench"}).count(),1);
      assert.equal(
        await panel.getByLabel("Growth timeline", { exact: true }).count(),
        1,
      );
      assert.equal(
        await panel
          .getByRole("textbox", { name: "Growth seed", exact: true })
          .count(),
        1,
      );
      if (viewport.width >= 1000) {
        const canvas = await page
          .getByLabel("Draw your whole pet here", { exact: true })
          .boundingBox();
        assert.ok(
          canvas.x >= bounds.width,
          "drawing remains alongside the left dock",
        );
      }
      // The left dock owns only diagnostics, never player starter selection.
      // Editing the preview seed must not create or change a living organism.
      await panel
        .getByRole("textbox", { name: "Growth seed", exact: true })
        .fill("CHECKBOX-PREVIEW");
      await panel
        .getByRole("button", { name: "Apply seed", exact: true })
        .click();
      const draft=await saved(page, (doc) => doc.seed === "CHECKBOX-PREVIEW");
      assert.equal(draft.life, undefined);
      if (process.env.UI_EVIDENCE_DIR && viewport.width !== 320) {
        await mkdir(process.env.UI_EVIDENCE_DIR, { recursive: true });
        // Scroll the independent dock back to its top before collecting interface evidence.
        await panel
          .getByRole("textbox", { name: "Growth seed", exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(
            process.env.UI_EVIDENCE_DIR,
            viewport.width > 500
              ? "development-desktop.png"
              : "development-narrow.png",
          ),
          fullPage: true,
        });
      }
      const on = button(page, "Preview player experience");
      if (viewport.width < 500) await on.tap();
      else {
        await on.focus();
        await page.keyboard.press("Space");
      }
      await page.getByText(/PREVIEW · DAY/).waitFor();
      assert.equal(await panel.count(), 0);
      assert.equal(await button(page,"Return to drawing").count(),1,
        "a nameless experimental organism has an explicit return to the editor");
      if(viewport.width<500)await button(page,"Return to drawing").tap();
      else await button(page,"Return to drawing").click();
      await page.getByLabel("Draw your whole pet here",{exact:true}).waitFor();
      assert.equal(await button(page,"Show or hide starter creature gallery").count(),1,
        "public starter gallery remains available without developer tools");
      assert.equal(
        await page.getByLabel("Growth timeline", { exact: true }).count(),
        0,
      );
      assert.equal(
        await button(page, "Enable development tools").getAttribute(
          "aria-pressed",
        ),
        "false",
      );
      const final = await saved(page, (doc) => doc.seed === "CHECKBOX-PREVIEW");
      assert.deepEqual(final.parts, draft.parts);
      assert.equal(final.life, undefined);
      await page.reload();
      await button(page, "Enable development tools").waitFor();
      assert.equal(
        await page
          .getByRole("complementary", { name: "Development tools panel" })
          .count(),
        0,
        "a reload starts in player mode",
      );
      await context.close();
    });
  }
  await test("birth once, care, Pet navigation, protected presets/import, refresh and offline reopen", async () => {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1000 },
    });
    // Keep biological age small; advance only seconds for this UI flow.
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const canvas = page.getByLabel("Draw your whole pet here", { exact: true });
    await canvas.waitFor();
    const c = await canvas.boundingBox();
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await button(page, "Begin life").click({ clickCount: 2 });
    const born = await saved(page, (doc) => !!doc.life);
    const identity = livingIdentity(born);
    await button(page, "Meal").click();
    const cared = await saved(
      page,
      (doc) => doc.life.game.commandHistory.length === 1,
    );
    assert.equal(cared.life.game.commandHistory[0].command.type, "feed");
    await button(page, "Draw your pet").click();
    await button(page, "Return to your pet").click();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    await openTools(page);
    await button(page,"Preview player experience").click();
    await button(page,"Draw your pet").click();
    await button(page,"Show or hide starter creature gallery").click();
    assert.equal(await page.getByRole("button",
      { name: /^Load starter drawing (?:[1-9]|1[0-2])$/ }).count(),12);
    for (const [presetNumber, presetSeed] of [
      [1, "STARTER-PIPPO-2026"],
      [2, "STARTER-BRUMBY-2026"],
      [3, "STARTER-GLIM-2026"],
      [4, "STARTER-THIMBLEAF-2026"],
      [5, "STARTER-VELLUNE-2026"],
      [6, "STARTER-CRAGGLE-2026"],
      [7, "STARTER-NIBBLET-2026"],
      [8, "STARTER-ORBINI-2026"],
      [9, "STARTER-SPOORI-2026"],
      [10, "STARTER-TUKKIN-2026"],
      [11, "STARTER-FLINTA-2026"],
      [12, "STARTER-VESPRI-2026"],
    ]) {
      // Loading a draft closes the gallery to restore the handheld canvas.
      if(await button(page,`Load starter drawing ${presetNumber}`).count()===0)
        await button(page,"Show or hide starter creature gallery").click();
      await button(page, `Load starter drawing ${presetNumber}`).click();
      await button(page,"Confirm replacement").click();
      await page.waitForFunction(
        (seed) =>
          JSON.parse(localStorage.getItem("infipet.pet"))?.seed === seed,
        presetSeed,
      );
      assert.deepEqual(
        livingIdentity(await stored(page)),
        identity,
        `starter ${presetNumber} does not replace the living organism`,
      );
    }
    await button(page,"Show or hide starter creature gallery").click();
    await button(page,"Load starter drawing 9").click();
    await button(page,"Confirm replacement").click();
    const draft = await saved(page, (doc) => doc.seed === "STARTER-SPOORI-2026");
    assert.deepEqual(
      livingIdentity(draft),
      identity,
      "choosing a preset only changes the draft",
    );
    await button(page, "Begin life").click();
    await button(page, "Keep current pet").click();
    assert.deepEqual(
      livingIdentity(await stored(page)),
      identity,
      "declining birth keeps same pet",
    );
    await button(page, "Return to your pet").click();
    await openTools(page);
    await page
      .getByRole("textbox", { name: "Growth seed", exact: true })
      .fill("DRAFT-ONLY-72");
    await button(page, "Apply seed").click();
    await saved(page, (doc) => doc.seed === "DRAFT-ONLY-72");
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    await openTools(page);
    await button(page, "Open growth timeline and diagnostics").click();
    await page.getByLabel("Growth timeline", { exact: true }).waitFor();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    await button(page, "Preview player experience").click();
    assert.equal(
      await page
        .getByRole("complementary", { name: "Development tools panel" })
        .count(),
      0,
    );
    await page.getByText(/PREVIEW · DAY/).waitFor();
    assert.equal(await button(page,"Meal").count(),0,
      "preview does not expose care controls for the living organism");
    await button(page,"Return to your pet").click();
    await button(page, "Meal").waitFor();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    assert.deepEqual(
      (await stored(page)).life.game.commandHistory,
      cared.life.game.commandHistory,
    );
    await page.reload();
    await button(page, "Meal").waitFor();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    assert.deepEqual(
      (await stored(page)).life.game.commandHistory,
      cared.life.game.commandHistory,
    );
    await button(page, "Open more menu").click();
    await button(page, "Export pet").click();
    await button(page, "Show pet code").click();
    const exported = await page
      .getByRole("textbox", { name: "Exported pet code", exact: true })
      .inputValue();
    assert.deepEqual(livingIdentity(JSON.parse(exported)), identity);
    await button(page, "Close panel").click();
    await button(page, "Open more menu").click();
    await button(page, "Import pet").click();
    await page
      .getByRole("textbox", { name: "Pet code to import", exact: true })
      .fill("invalid pet");
    await button(page, "Import pet code").click();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    await page
      .getByRole("textbox", { name: "Pet code to import", exact: true })
      .fill(exported);
    await button(page, "Import pet code").click();
    await button(page, "Keep current pet").click();
    assert.deepEqual(livingIdentity(await stored(page)), identity);
    await button(page, "Open more menu").click();
    await button(page, "Import pet").click();
    await page
      .getByRole("textbox", { name: "Pet code to import", exact: true })
      .fill(exported);
    await button(page, "Import pet code").click();
    await button(page, "Confirm replacement").click();
    await button(page, "Meal").waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await button(page, "Meal").waitFor();
    const offline = await stored(page);
    assert.deepEqual(livingIdentity(offline), identity);
    assert.deepEqual(
      offline.life.game.commandHistory,
      cared.life.game.commandHistory,
    );
    await button(page, "Clean").click();
    await saved(page, (doc) => doc.life.game.commandHistory.length === 2);
    await context.setOffline(false);
    // The same exported document opens in another clean browser, too.
    const other = await browser.newContext();
    const importedPage = await other.newPage();
    await importedPage.goto(url);
    await button(importedPage, "Open more menu").click();
    await button(importedPage, "Import pet").click();
    await importedPage
      .getByRole("textbox", { name: "Pet code to import", exact: true })
      .fill(exported);
    await button(importedPage, "Import pet code").click();
    await importedPage.waitForFunction(
      () => !!JSON.parse(localStorage.getItem("infipet.pet"))?.life,
    );
    assert.deepEqual(livingIdentity(await stored(importedPage)), identity);
    await other.close();
    // A positive explicit replacement commits the preset, once.
    await button(page, "Draw your pet").click();
    await button(page, "Begin life").click();
    await button(page, "Confirm replacement").click({ clickCount: 2 });
    const replacement = await saved(
      page,
      (doc) => doc.life.seed === "DRAFT-ONLY-72",
    );
    assert.notEqual(replacement.life.game.clock.startedAtMs, identity.birth);
    assert.deepEqual(replacement.life.parts, replacement.parts);
    assert.deepEqual(replacement.life.game.commandHistory, []);
    await context.close();
  });
  await test("all three care games offer usable cues and five real rounds; healthy juvenile battles animate a real result",async()=>{
    const context=await browser.newContext(),page=await context.newPage();
    page.on("pageerror",error=>errors.push(error.message));
    await page.clock.install({time:new Date(Date.UTC(2026,9,27,12,17,23,456))});
    await page.goto(url);const canvas=page.getByLabel("Draw your whole pet here",{exact:true});
    const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await button(page,"Begin life").click();await button(page,"Play and training").click();
    for(const name of ["Training","Direction","Numbers"]){
      await button(page,name).click();
      for(let round=0;round<5;round++){
        const doc=await saved(page,doc=>!!doc.life?.game.activity?.targets),activity=doc.life.game.activity;
        assert.equal(activity.round,round);
        if(name==="Training")await page.getByText(/^Aim (high|low)$/).waitFor();
        if(name==="Direction")await page.getByText("Follow your pet's lean",{exact:true}).waitFor();
        if(name==="Numbers")await page.getByText(/ · Guess higher or lower$/).waitFor();
        const choice=name==="Training"?(activity.targets[round]===0?"High":"Low"):
          name==="Direction"?(activity.targets[round]===0?"Left":"Right"):
          activity.shownNumbers[round]<=5?"Higher":"Lower";
        await button(page,choice).click();
        await page.waitForFunction(r=>{const a=JSON.parse(localStorage.getItem("infipet.pet"))?.life?.game.activity;return a?.kind==="result"||a?.round===r+1;},round);
      }
      const result=(await stored(page)).life.game.activity;assert.equal(result.kind,"result");
      assert.equal(result.rounds,5);if(name!=="Numbers")assert.equal(result.score,5);
      await button(page,"Back to pet").click();
    }
    const fixture=path.join(tmpdir(),"infipet-games-juvenile.json");
    execFileSync(process.execPath,["--import","tsx","scripts/create-year-life-fixture.ts",fixture,"168"],{stdio:"pipe"});
    const juvenile=JSON.parse(await readFile(fixture,"utf8"));
    // Open import before shifting the active pet's simulated clock forward.
    // Otherwise the prior life performs 168 days of catch-up while Playwright
    // is trying to click the modal, repeatedly detaching its controls.
    await button(page,"Open more menu").click();await button(page,"Import pet").click();
    const choosing=page.waitForEvent("filechooser");await button(page,"Open pet file").click();
    await page.clock.setFixedTime(new Date(juvenile.life.game.clock.nowMs));
    await(await choosing).setFiles(fixture);await button(page,"Confirm replacement").click();
    await button(page,"Play and training").click();await button(page,"CPU battle").click();
    await page.getByText(/^(Victory|Defeat) against /).waitFor();
    await page.getByText(/ · (Victory|Defeat)$/).waitFor();
    await button(page,"Back to pet").click();await context.close();
  });
  await test("daily boundaries, mature checkpoint reopening, damaged-cache recovery and original-save preservation",async()=>{
    const context=await browser.newContext();const page=await context.newPage();
    page.on("pageerror",error=>errors.push(error.message));
    const T=Date.UTC(2026,9,27,12,17,23,456),DAY=86400000;
    await page.clock.install({time:new Date(T)});
    await page.goto(url);
    const canvas=page.getByLabel("Draw your whole pet here",{exact:true});await canvas.waitFor();
    const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await button(page,"Begin life").click();await button(page,"Meal").waitFor();
    const birth=await saved(page,doc=>!!doc.life);
    const anchor=birth.life.game.clock.hatchAtMs;
    const identity=livingIdentity(birth);
    await page.goto("about:blank");await page.clock.setFixedTime(new Date(anchor+DAY-1));await page.goto(url);await button(page,"Meal").waitFor();
    const before=await saved(page,doc=>doc.life.game.clock.nowMs>=doc.life.game.clock.hatchAtMs+86400000-1);
    assert.equal(before.life.anatomicalCheckpoint,undefined,"no physical step before 24 elapsed hours");
    await page.goto("about:blank");await page.clock.setFixedTime(new Date(anchor+DAY));await page.goto(url);await button(page,"Meal").waitFor();
    const first=await saved(page,doc=>doc.life.anatomicalCheckpoint?.state.completedChecks===1);
    assert.equal(first.life.anatomicalCheckpoint.state.checks[0].atMs,anchor+DAY);
    // A mounted tab returns through the same sliced catch-up path as reopening.
    await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
    await page.clock.setFixedTime(new Date(anchor+7*DAY));
    await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"visible"});document.dispatchEvent(new Event("visibilitychange"));});
    const mounted=await saved(page,doc=>doc.life.anatomicalCheckpoint?.state.completedChecks===7);
    assert.deepEqual(mounted.life.anatomicalCheckpoint.state.checks.map(c=>c.checkIndex),[1,2,3,4,5,6,7]);
    assert.deepEqual(livingIdentity(mounted),identity);

    await page.goto("about:blank");await page.clock.setFixedTime(new Date(anchor+365*DAY));await page.goto(url);await button(page,"Meal").waitFor();
    const grown=await saved(page,doc=>doc.life.anatomicalCheckpoint?.state.completedChecks===365);
    const mature=JSON.stringify(grown.life.anatomicalCheckpoint.state);
    assert.deepEqual(livingIdentity(grown),identity);
    await page.goto("about:blank");await page.clock.setFixedTime(new Date(anchor+366*DAY));await page.goto(url);await button(page,"Meal").waitFor();
    const older=await saved(page,doc=>doc.life.game.clock.nowMs>=doc.life.game.clock.hatchAtMs+366*86400000);
    assert.equal(JSON.stringify(older.life.anatomicalCheckpoint.state),mature);
    const broken=JSON.parse(JSON.stringify(older));broken.life.anatomicalCheckpoint.state.graph.cells[0].x+=1;
    await page.goto("about:blank");
    await page.addInitScript(raw=>{if(location.protocol!=="http:"&&location.protocol!=="https:")return;if(!sessionStorage.getItem("broken-seeded")){localStorage.setItem("infipet.pet",raw);sessionStorage.setItem("broken-seeded","yes");}},JSON.stringify(broken));
    await page.goto(url);await button(page,"Meal").waitFor();
    await page.waitForFunction(x=>JSON.parse(localStorage.getItem("infipet.pet"))?.life?.anatomicalCheckpoint?.state.graph.cells[0].x!==x,broken.life.anatomicalCheckpoint.state.graph.cells[0].x);
    const repaired=await stored(page);
    // Inspect after the recovery save rather than trusting a renderer count.
    assert.equal(JSON.stringify(repaired.life.anatomicalCheckpoint.state),mature);
    const legacy=JSON.parse(JSON.stringify(birth));delete legacy.life.anatomicalClock;delete legacy.life.anatomicalCheckpoint;delete legacy.life.game.careObservations;
    const original=JSON.stringify(legacy);
    await page.goto("about:blank");
    await page.addInitScript(raw=>{if(location.protocol!=="http:"&&location.protocol!=="https:")return;if(!sessionStorage.getItem("legacy-seeded")){localStorage.setItem("infipet.pet",raw);sessionStorage.setItem("legacy-seeded","yes");}},original);
    await page.clock.setFixedTime(new Date(anchor+3600000));await page.goto(url);
    await page.getByText("This earlier saved pet is preserved.",{exact:false}).waitFor();
    assert.equal(await button(page,"Meal").count(),0,"earlier life is read-only, never a fabricated daily chronology");
    assert.equal(await page.evaluate(()=>localStorage.getItem("infipet.pet")),original,"original main bytes are unchanged");
    await openTools(page);await button(page,"Preview player experience").click();
    assert.equal(await page.getByLabel("Draw your whole pet here",{exact:true}).isVisible(),true,
      "leaving developer tools returns a preserved earlier life to its original drawing");

    const backup=await page.evaluate(()=>localStorage.getItem(localStorage.getItem("infipet.before-daily-v1")));
    assert.equal(backup,original,"exact pre-migration bytes survive before replacement");
    await button(page,"Open more menu").click();await button(page,"Export pet").click();
    assert.equal(await button(page,"Download original saved pet").isVisible(),true);
    await button(page,"Close panel").click();await button(page,"Begin life").click();
    await button(page,"Confirm replacement").click();await button(page,"Meal").waitFor();
    const replacement=await saved(page,doc=>doc.life.anatomicalClock==="daily-365-v1");
    assert.deepEqual(replacement.life.parts,identity.parts);
    assert.notEqual(replacement.life.game.clock.hatchAtMs,anchor,"new life receives a real new birth timestamp");
    assert.deepEqual(replacement.life.game.commandHistory,[]);
    assert.equal(replacement.life.anatomicalCheckpoint,undefined,"no invented pre-creation check history");
    await context.close();
    const blocked=await browser.newContext(),blockedPage=await blocked.newPage();
    blockedPage.on("pageerror",error=>errors.push(error.message));
    await blockedPage.addInitScript(raw=>{
      if(location.protocol!=="http:"&&location.protocol!=="https:")return;
      localStorage.setItem("infipet.pet",raw);
      const originalSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key.startsWith("infipet.before-daily-v1"))throw new Error("Qualification: backup storage unavailable");
        return originalSet.call(this,key,value);
      };
    },original);
    await blockedPage.goto(url);await blockedPage.getByRole("alert").waitFor();
    assert.equal(await blockedPage.evaluate(()=>localStorage.getItem("infipet.pet")),original);
    const pad=blockedPage.getByLabel("Draw your whole pet here",{exact:true});await pad.waitFor();
    const area=await pad.boundingBox();await blockedPage.mouse.click(area.x+area.width/2,area.y+area.height/2);
    await button(blockedPage,"Begin life").click();await button(blockedPage,"Meal").waitFor();
    await blockedPage.getByText("Progress is unsaved.",{exact:false}).waitFor();
    assert.equal(await blockedPage.evaluate(()=>localStorage.getItem("infipet.pet")),original,
      "backup failure cannot be bypassed by beginning a new life: exact original main bytes survive");
    await blocked.close();
  });
  await test("healthy 366-day maximum-complexity save persists through IndexedDB and reopens offline",async()=>{
    const fixture=path.join(tmpdir(),"infipet-year-life-browser.json");
    execFileSync(process.execPath,["--import","tsx","scripts/create-year-life-fixture.ts",fixture],{stdio:"pipe"});
    const raw=await readFile(fixture,"utf8"),expected=JSON.parse(raw);
    assert.ok(raw.length>1500000,"exercise large persistent care and checkpoint storage");
    const context=await browser.newContext(),page=await context.newPage();
    page.on("pageerror",error=>errors.push(error.message));
    await page.clock.install({time:new Date(expected.life.game.clock.nowMs)});
    await page.goto(url);await button(page,"Open more menu").click();await button(page,"Import pet").click();
    const choosing=page.waitForEvent("filechooser");await button(page,"Open pet file").click();
    await (await choosing).setFiles(fixture);await button(page,"Meal").waitFor();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem("infipet.pet"))?.storage==="infipet-indexeddb-v1");
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);await page.reload();await button(page,"Meal").waitFor();
    await button(page,"Open more menu").click();await button(page,"Export pet").click();
    const downloading=page.waitForEvent("download");await button(page,"Download pet file").click();
    const opened=JSON.parse(await readFile(await (await downloading).path(),"utf8"));
    assert.deepEqual(livingIdentity(opened),livingIdentity(expected));
    assert.equal(opened.life.game.dead,false,"healthy biological life continues beyond maturity");
    assert.equal(opened.life.anatomicalCheckpoint.state.completedChecks,365);
    assert.deepEqual(opened.life.anatomicalCheckpoint.state.graph,expected.life.anatomicalCheckpoint.state.graph);
    assert.deepEqual(opened.life.game.commandHistory,expected.life.game.commandHistory);
    await button(page,"Close panel").click();
    await page.clock.setFixedTime(new Date(expected.life.game.clock.nowMs+90*60000));await button(page,"Snack").click();
    await button(page,"Open more menu").click();await button(page,"Export pet").click();
    const careDownload=page.waitForEvent("download");await button(page,"Download pet file").click();
    const cared=JSON.parse(await readFile(await(await careDownload).path(),"utf8"));
    assert.equal(cared.life.game.dead,false);assert.equal(cared.life.game.meters.happiness,4);
    assert.ok(cared.life.game.physiology.events.some(p=>p.atMs>366*86400000));
    assert.deepEqual(cared.life.anatomicalCheckpoint.state.graph,opened.life.anatomicalCheckpoint.state.graph);
    await context.close();
  });
  await test("player starter gallery and developer morphology tools remain separate from saved life",async()=>{
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto(url);
    await page.getByLabel("Draw your whole pet here",{exact:true}).waitFor();
    assert.equal(await button(page,"Show or hide starter creature gallery").count(),1);
    await button(page,"Show or hide starter creature gallery").click();
    assert.equal(await page.getByRole("button",{name:/^Load starter drawing (?:[1-9]|1[0-2])$/}).count(),12);
    assert.equal(await page.getByText("Pippo",{exact:true}).count(),0,
      "starter thumbnails never impose character names");
    await button(page,"Load starter drawing 1").click();
    assert.equal(await button(page,"Begin life").isDisabled(),false);
    await button(page,"Begin life").click();
    await button(page,"Meal").waitFor();
    const pet=await saved(page,doc=>doc?.life?.name==="Little one");
    const identity=livingIdentity(pet);
    await openTools(page);
    await button(page,"Expand morphology workbench").click();
    for(const kind of ["elongate","expand","branch","bud","fuse","resorb","remodel","reinforce"])
      assert.equal(await page.getByLabel(kind+" operator expression",{exact:true}).count(),1,
        "dev-only material control exists: "+kind);
    await button(page,"Compare original and experimental physical morphology").click();
    await page.getByText("PHYSICAL COMPARISON",{exact:false}).waitFor();
    await button(page,"Preview player experience").click();
    const preserved=await stored(page);
    assert.deepEqual(livingIdentity(preserved),identity,
      "developer preview did not modify original player source, seed or birth");
    assert.equal("operatorMultipliers" in preserved,false,
      "experimental tuning is not persisted as a pet property");
    await context.close();
  });
  await test("mobile morphology sliders survive hiding dev tools and never rewrite a living pet",async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto(url);
    await button(page,"Show or hide starter creature gallery").tap();
    await button(page,"Load starter drawing 1").tap();
    await button(page,"Begin life").tap();
    await button(page,"Meal").waitFor();
    const born=await saved(page,doc=>!!doc.life);
    const identity=livingIdentity(born);
    await button(page,"Enable development tools").tap();
    await button(page,"View adult").click();
    await button(page,"Expand morphology workbench").click();
    const slider=page.getByLabel("expand operator expression",{exact:true});
    // Dev drawer layout and the native-web slider may settle one animation
    // frame after the expandable panel becomes interactive. Keep the same
    // strictly readable (>70px) tap-area contract; never accept zero width.
    await page.waitForFunction(()=>{
      const el=document.querySelector('[aria-label="expand operator expression"]');
      return (el?.getBoundingClientRect().width??0)>70;
    },null,{timeout:5000});
    const bounds=await slider.boundingBox();
    assert.ok(bounds?.width>70,"usable slider width: "+JSON.stringify(bounds));
    await slider.tap({position:{x:bounds.width*0.82,y:bounds.height/2}});
    // Sliding commits to sandbox at the pointer release, with no extra
    // "Apply" step or silent transition to the real saved organism.
    await button(page,"Preview player experience").tap();
    await page.getByText(/PREVIEW · DAY/).waitFor();
    assert.equal(await button(page,"Return to your pet").count(),1);
    assert.equal(await button(page,"Meal").count(),0,
      "care actions must not target the experimental creature");
    assert.deepEqual(livingIdentity(await stored(page)),identity);
    await button(page,"Return to your pet").tap();
    await button(page,"Meal").waitFor();
    assert.equal(await page.getByText(/PREVIEW · DAY/).count(),0);
    assert.deepEqual(livingIdentity(await stored(page)),identity);
    await context.close();
  });
  assert.deepEqual(errors, [], "no application runtime errors");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
