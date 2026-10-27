/** Real exported-app interaction tests. Run pnpm build:web, install Chromium,
 * then pnpm test:ui. UI screenshots are layout evidence only. */
import test from "node:test";
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
  await button(page, "Open more menu").click();
  await button(page, "Open Development Tools").click();
}
const errors = [];
try {
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
      assert.equal(await button(page, "Return to your pet").isDisabled(), true);
      assert.equal(await button(page, "Begin life").isDisabled(), true);
      for (const name of parts) {
        const part = button(page, `Draw ${name.toLowerCase()}`);
        assert.equal(await part.isVisible(), true);
        if (viewport.width < 500) await part.tap();
        else await part.click();
        assert.equal(await part.getAttribute("aria-pressed"), "true");
        assert.equal(await button(page, "Close panel").count(), 0);
      }
      // Five columns and three rows, with no clipped part labels or page overflow.
      const bounds = await Promise.all(
        parts.map((name) =>
          button(page, `Draw ${name.toLowerCase()}`).boundingBox(),
        ),
      );
      assert.equal(new Set(bounds.map((b) => Math.round(b.y))).size, 3);
      assert.equal(new Set(bounds.map((b) => Math.round(b.x))).size, 5);
      assert.ok(
        bounds.every((b) => b.x >= 0 && b.x + b.width <= viewport.width),
      );
      const c = await canvas.boundingBox();
      await button(page, "Draw body").click();
      if (viewport.width < 500)
        await canvas.tap({
          position: { x: c.width * 0.45, y: c.height * 0.5 },
        });
      else await page.mouse.click(c.x + c.width * 0.45, c.y + c.height * 0.5);
      await saved(page, (doc) =>
        doc.parts.some((p) => p.kind === "body" && p.pixels.length),
      );
      const first = (await stored(page)).parts;
      await button(page, "Draw head").click();
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
    assert.equal(
      await page.getByRole("button", { name: /^Load .* preset$/ }).count(),
      12,
    );
    for (const [presetName, presetSeed] of [
      ["Bean", "BEAN-87320104"],
      ["Sprout", "SPROUT-39481726"],
      ["Cub", "CUB-72018439"],
      ["Ribbon", "RIBBON-51820476"],
      ["Beetle", "BEETLE-26091384"],
      ["Wisp", "WISP-63817205"],
      ["Coral", "CORAL-28174690"],
      ["Stilt", "STILT-48193062"],
      ["Kite", "KITE-93716284"],
      ["Lantern", "LANTERN-16284039"],
      ["Drift", "DRIFT-59271048"],
      ["Crown", "CROWN-74920163"],
    ]) {
      await button(page, `Load ${presetName} preset`).click();
      await page.waitForFunction(
        (seed) =>
          JSON.parse(localStorage.getItem("infipet.pet"))?.seed === seed,
        presetSeed,
      );
      assert.deepEqual(
        livingIdentity(await stored(page)),
        identity,
        `${presetName} does not replace the living organism`,
      );
      await openTools(page);
    }
    await button(page, "Load Coral preset").click();
    const draft = await saved(page, (doc) => doc.seed === "CORAL-28174690");
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
    await button(page, "Return to your pet").click();
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
  assert.deepEqual(errors, [], "no application runtime errors");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
