import test from "node:test";
import assert from "node:assert/strict";
import { developmentLayout } from "../src/interface/development-layout";

test("[UI-002/A1] author-style dock uses reference dimensions and leaves the player area intact when disabled", () => {
  // Independent expected values from pre-programmed authorDesktopSuite.css at a 16px root.
  const at1280 = developmentLayout(1280, true);
  assert.equal(at1280.desktop, true);
  assert.ok(Math.abs(at1280.panelWidth - 358.4) < 1e-10);
  assert.ok(Math.abs(at1280.playerOffset - 384) < 1e-10);
  assert.ok(Math.abs(at1280.playerWidth - 896) < 1e-10);
  assert.deepEqual(developmentLayout(1000, true), {
    desktop: true,
    panelWidth: 352,
    playerOffset: 372,
    playerWidth: 628,
  });
  assert.deepEqual(developmentLayout(1920, true), {
    desktop: true,
    panelWidth: 480,
    playerOffset: 512,
    playerWidth: 1408,
  });
  for (const width of [320, 390, 999]) {
    assert.deepEqual(developmentLayout(width, true), {
      desktop: false,
      panelWidth: width,
      playerOffset: 0,
      playerWidth: width,
    });
  }
  for (let width = 320; width <= 3840; width++) {
    const off = developmentLayout(width, false),
      on = developmentLayout(width, true);
    assert.equal(off.playerOffset, 0);
    assert.equal(off.playerWidth, width);
    assert.ok(on.panelWidth > 0 && on.panelWidth <= width);
    assert.equal(on.playerWidth + on.playerOffset, width);
    if (on.desktop) {
      assert.ok(on.panelWidth >= 352 && on.panelWidth <= 480);
      assert.ok(on.playerWidth >= 448);
      assert.ok(on.playerOffset > on.panelWidth);
    }
  }
});
