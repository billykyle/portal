import { mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORT = { width: 393, height: 852 };

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function pngPixel(png: Buffer, x: number, y: number) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 2;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows: Buffer[] = [];
  let pos = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = raw[pos] ?? 0;
    pos += 1;
    const line = Buffer.alloc(stride);
    const prev = rows[rowIndex - 1];
    for (let i = 0; i < stride; i += 1) {
      const byte = raw[pos] ?? 0;
      pos += 1;
      const left = i >= channels ? (line[i - channels] ?? 0) : 0;
      const up = prev ? (prev[i] ?? 0) : 0;
      const upLeft = prev && i >= channels ? (prev[i - channels] ?? 0) : 0;
      if (filter === 0) line[i] = byte;
      else if (filter === 1) line[i] = (byte + left) & 255;
      else if (filter === 2) line[i] = (byte + up) & 255;
      else if (filter === 3) line[i] = (byte + Math.floor((left + up) / 2)) & 255;
      else line[i] = (byte + paeth(left, up, upLeft)) & 255;
    }
    rows.push(line);
  }
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const row = rows[py];
  const index = px * channels;
  return { r: row?.[index] ?? 0, g: row?.[index + 1] ?? 0, b: row?.[index + 2] ?? 0, width, height };
}

async function shot(page: Page, name: string) {
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const path = `/opt/cursor/artifacts/${name}.png`;
  await page.screenshot({ path });
  return path;
}

async function viewerReady(page: Page) {
  await page.waitForFunction(() => document.querySelector("[data-photo-viewer]")?.parentElement === document.body);
}

async function imageIds(page: Page) {
  return page.locator("[data-photo-original], [data-photo-thumb]").evaluateAll((images) =>
    images.map((image) => image.getAttribute("data-photo-id")),
  );
}

async function seated(page: Page) {
  return page.evaluate(() => {
    const text = document.querySelector("[data-photo-filename]");
    const image = document.querySelector("[data-photo-image]");
    const header = document.querySelector("[data-photo-header]");
    const reel = document.querySelector("[data-photo-reel]");
    const stage = document.querySelector("[data-photo-stage]");
    const stack = document.querySelector("[data-photo-stack]");
    if (!text || !image || !header || !reel || !stage || !stack) return null;
    const range = document.createRange();
    range.selectNodeContents(text);
    const ink = range.getBoundingClientRect();
    const frame = image.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const reelBox = reel.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const stackBox = stack.getBoundingClientRect();
    const style = getComputedStyle(text);
    const padBottom = Number.parseFloat(getComputedStyle(stage).paddingBottom) || 0;
    const img = document.querySelector("[data-photo-original]") as HTMLImageElement | null;
    return {
      gap: frame.top - ink.bottom,
      reelGap: reelBox.top - frame.bottom,
      spaceAbove: stackBox.top - stageBox.top,
      spaceBelow: stageBox.bottom - padBottom - stackBox.bottom,
      nameTop: ink.top,
      headerBottom: headerBox.bottom,
      imageBottom: frame.bottom,
      reelTop: reelBox.top,
      reelBottom: reelBox.bottom,
      viewportHeight: window.innerHeight,
      lineHeight: Number.parseFloat(style.lineHeight),
      fontSize: Number.parseFloat(style.fontSize),
      clipped: text.scrollHeight > text.clientHeight + 1,
      natural: img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0,
      shown: frame.width > 0 && frame.height > 0 ? frame.width / frame.height : 0,
      width: frame.width,
      height: frame.height,
      reelInStack: stack.contains(reel),
    };
  });
}

function expectSeated(
  fit: {
    gap: number;
    reelGap: number;
    spaceAbove: number;
    spaceBelow: number;
    nameTop: number;
    headerBottom: number;
    imageBottom: number;
    reelTop: number;
    reelBottom: number;
    viewportHeight: number;
    width: number;
    height: number;
    clipped: boolean;
    reelInStack: boolean;
  } | null,
  minWidth: number,
) {
  expect(fit).not.toBeNull();
  expect(fit!.gap).toBeGreaterThanOrEqual(12);
  expect(fit!.gap).toBeLessThanOrEqual(36);
  expect(fit!.nameTop).toBeGreaterThanOrEqual(fit!.headerBottom - 1);
  expect(fit!.reelInStack).toBe(true);
  expect(Math.abs(fit!.reelGap - 16)).toBeLessThanOrEqual(1.5);
  expect(fit!.spaceAbove).toBeGreaterThanOrEqual(-2);
  expect(fit!.spaceBelow).toBeGreaterThanOrEqual(-2);
  expect(Math.abs(fit!.spaceAbove - fit!.spaceBelow)).toBeLessThanOrEqual(2);
  expect(fit!.reelBottom).toBeLessThanOrEqual(fit!.viewportHeight + 1);
  expect(fit!.clipped).toBe(false);
  expect(fit!.width).toBeGreaterThan(minWidth);
  expect(fit!.height).toBeGreaterThan(160);
}

async function expectReelThumbs(page: Page, width: number, height: number) {
  const current = page.locator("[data-photo-reel] [aria-current='true']");
  await expect
    .poll(async () => {
      const box = await current.boundingBox();
      const fit = await current
        .locator("[data-reel-thumb]")
        .evaluate((el) => getComputedStyle(el).objectFit)
        .catch(() => "");
      if (!box || box.width <= 0 || box.height <= 0) return null;
      return {
        width: Math.abs(box.width - width) <= 1,
        height: Math.abs(box.height - height) <= 1,
        ratio: Math.abs(box.width / box.height - 1.5) < 0.05,
        fit,
      };
    })
    .toEqual({ width: true, height: true, ratio: true, fit: "cover" });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test("covers the viewport and keeps the filename above the photo", async ({ page }) => {
  await page.goto("/dev/lightbox");
  const viewer = page.locator("[data-photo-viewer]");
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 393, height: 852 });

  await expect
    .poll(() => page.locator("[data-photo-backdrop]").evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(0, 0, 0, 0.95)");
  const backdrop = await page.locator("[data-photo-backdrop]").boundingBox();
  expect(backdrop).not.toBeNull();
  expect(backdrop!.x).toBeLessThanOrEqual(0);
  expect(backdrop!.y).toBeLessThanOrEqual(0);
  expect(backdrop!.x + backdrop!.width).toBeGreaterThanOrEqual(393);
  expect(backdrop!.y + backdrop!.height).toBeGreaterThanOrEqual(852);

  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-01.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("1 / 89");

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const text = document.querySelector("[data-photo-filename]");
        const image = document.querySelector("[data-photo-image]");
        if (!text || !image) return null;
        const range = document.createRange();
        range.selectNodeContents(text);
        const ink = range.getBoundingClientRect();
        const frame = image.getBoundingClientRect();
        const style = getComputedStyle(text);
        const img = document.querySelector("[data-photo-original]") as HTMLImageElement | null;
        return {
          gap: frame.top - ink.bottom,
          lineHeight: Number.parseFloat(style.lineHeight),
          fontSize: Number.parseFloat(style.fontSize),
          clipped: text.scrollHeight > text.clientHeight + 1,
          natural: img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0,
          shown: frame.width > 0 ? frame.width / frame.height : 0,
          width: frame.width,
          height: frame.height,
        };
      }),
    )
    .toMatchObject({ clipped: false });

  await expect
    .poll(() =>
      page.locator("[data-photo-original]").evaluate((img: HTMLImageElement) => img.naturalWidth).catch(() => 0),
    )
    .toBeGreaterThan(0);

  const fit = await page.evaluate(() => {
    const text = document.querySelector("[data-photo-filename]");
    const image = document.querySelector("[data-photo-image]");
    if (!text || !image) return null;
    const range = document.createRange();
    range.selectNodeContents(text);
    const ink = range.getBoundingClientRect();
    const frame = image.getBoundingClientRect();
    const style = getComputedStyle(text);
    const img = document.querySelector("[data-photo-original]") as HTMLImageElement | null;
    const side = document.elementFromPoint(Math.min(frame.right + 8, 380), ink.top + 4);
    return {
      gap: frame.top - ink.bottom,
      lineHeight: Number.parseFloat(style.lineHeight),
      fontSize: Number.parseFloat(style.fontSize),
      clipped: text.scrollHeight > text.clientHeight + 1,
      natural: img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0,
      shown: frame.width / frame.height,
      width: frame.width,
      height: frame.height,
      sideInViewer: Boolean(side?.closest("[data-photo-viewer]")),
    };
  });
  expect(fit).not.toBeNull();
  expect(fit!.gap).toBeGreaterThanOrEqual(12);
  expect(fit!.lineHeight).toBeGreaterThanOrEqual(fit!.fontSize * 1.4);
  expect(fit!.clipped).toBe(false);
  expect(fit!.width).toBeGreaterThan(300);
  expect(fit!.height).toBeGreaterThan(160);
  expect(Math.abs(fit!.natural - 1.6)).toBeLessThan(0.05);
  expect(Math.abs(fit!.shown - fit!.natural)).toBeLessThan(0.05);
  expect(fit!.sideInViewer).toBe(true);

  const layout = await seated(page);
  expectSeated(layout, 300);
  expect(layout!.spaceBelow).toBeGreaterThan(80);
  await expectReelThumbs(page, 60, 40);
  const stageStyle = await page.locator("[data-photo-stage]").getAttribute("style");
  expect(stageStyle).toContain("safe-area-inset-bottom");

  const viewerBox = await viewer.boundingBox();
  expect(backdrop!.x).toBeLessThanOrEqual(viewerBox!.x);
  expect(backdrop!.y).toBeLessThanOrEqual(viewerBox!.y);
  expect(backdrop!.x + backdrop!.width).toBeGreaterThanOrEqual(viewerBox!.x + viewerBox!.width);
  expect(backdrop!.y + backdrop!.height).toBeGreaterThanOrEqual(viewerBox!.y + viewerBox!.height);
  const shadow = await page.locator("[data-photo-backdrop]").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toMatch(/rgba?\(0,\s*0,\s*0/);
  expect(shadow).not.toContain("vh");

  const screen = await shot(page, "lightbox-webkit-393");
  const png = await page.screenshot();
  for (const x of [4, 196, 388]) {
    const pixel = pngPixel(png, x, 132);
    expect(pixel.r).toBeGreaterThan(6);
    expect(pixel.r).toBeLessThan(20);
    expect(pixel.g).toBeLessThan(8);
    expect(pixel.b).toBeLessThan(8);
  }
  expect(screen).toContain("lightbox-webkit-393");
});

test("ten rapid next taps stay in lockstep and a late image cannot cover the current one", async ({ page }) => {
  let releaseSlow: (() => void) | undefined;
  const slow = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  await page.route("**/dev/photos/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/02") && !url.searchParams.has("thumb")) await slow;
    await route.continue();
  });

  await page.goto("/dev/lightbox");
  await viewerReady(page);
  const next = page.getByRole("button", { name: "Next photo" });
  for (let step = 0; step < 10; step += 1) {
    await next.click();
    const label = String(step + 2).padStart(2, "0");
    await expect(page.locator("[data-photo-filename]")).toHaveText(`Full-${label}.jpg`);
    await expect(page.locator("[data-photo-count]")).toHaveText(`${step + 2} / 89`);
    await expect(page.locator("[data-photo-index]")).toHaveAttribute("data-photo-index", String(step + 1));
    const ids = await imageIds(page);
    expect(ids).toEqual([label]);
  }

  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Next photo"]');
    for (let tap = 0; tap < 10; tap += 1) button?.click();
  });
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-21.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("21 / 89");
  expect(await imageIds(page)).toEqual(["21"]);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector("[data-photo-original]") as HTMLImageElement | null;
        return Boolean(img && img.getAttribute("data-photo-id") === "21" && img.complete && img.naturalWidth > 0);
      }),
    )
    .toBe(true);

  releaseSlow?.();
  await page.waitForTimeout(400);
  expect(await imageIds(page)).toEqual(["21"]);
  const painted = await page.locator("[data-photo-image]").screenshot();
  const box = await page.locator("[data-photo-image]").boundingBox();
  const color = pngPixel(painted, (box?.width ?? 10) / 2, (box?.height ?? 10) / 2);
  expect(color.r).toBeGreaterThanOrEqual(21 * 6 - 2);
  expect(color.r).toBeLessThanOrEqual(21 * 6 + 2);

  await expect.poll(async () => (await seated(page))?.gap ?? -1).toBeGreaterThanOrEqual(12);
  expectSeated(await seated(page), 300);
  await shot(page, "lightbox-after-rapid-taps");
});

test("thirty rapid taps and swipes never leave the previous photo on screen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/dev/photos/**", async (route) => {
    const url = new URL(route.request().url());
    // Slow-3G latency for originals. Thumbs stay immediate so the stand-in can paint.
    if (!url.searchParams.has("thumb")) await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.goto("/dev/lightbox");
  await viewerReady(page);
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-01.jpg");

  const show = async (n: number) => {
    const label = String(n).padStart(2, "0");
    const previous = n - 1;
    await expect(page.locator("[data-photo-filename]")).toHaveText(`Full-${label}.jpg`);
    await expect(page.locator("[data-photo-count]")).toHaveText(`${n} / 89`);
    await expect(page.locator("[data-photo-image] img")).toHaveCount(1);
    const img = page.locator("[data-photo-image] img");
    await expect(img).toHaveAttribute("data-photo-id", label);
    const src = await img.getAttribute("src");
    expect(src).toContain(`/dev/photos/${label}`);
    expect(src).not.toContain(`/dev/photos/${String(previous).padStart(2, "0")}`);
    const reused = await img.evaluate((node) => {
      const holder = window as unknown as { __stageImg?: Element };
      const same = holder.__stageImg === node;
      holder.__stageImg = node;
      return Boolean(holder.__stageImg && same);
    });
    expect(reused).toBe(false);
    await expect(page.locator("[data-photo-image]")).toHaveCSS("overflow", "hidden");
    await expect(page.locator(`[data-photo-image] img[data-photo-id="${String(previous).padStart(2, "0")}"]`)).toHaveCount(0);

    const frame = await page.locator("[data-photo-image]").boundingBox();
    expect(frame).not.toBeNull();
    const png = await page.screenshot();
    const color = pngPixel(png, frame!.x + frame!.width / 2, frame!.y + frame!.height / 2);
    const gap = pngPixel(png, frame!.x + frame!.width / 2, frame!.y + frame!.height + 4);
    const red = n * 6;
    const stale = previous * 6;
    if (Math.abs(color.r - stale) <= 2 && Math.abs(color.b - 40) <= 8) {
      throw new Error(`main area still shows photo ${previous} (rgb ${color.r},${color.g},${color.b}) at index ${n}`);
    }
    if (Math.abs(color.r - red) > 2) {
      await expect
        .poll(async () => {
          const next = await page.locator("[data-photo-image]").screenshot();
          const box = await page.locator("[data-photo-image]").boundingBox();
          return pngPixel(next, (box?.width ?? 2) / 2, (box?.height ?? 2) / 2).r;
        })
        .toBeGreaterThanOrEqual(red - 2);
    }
    expect(gap.b).toBeLessThan(15);
    expect(gap.g).toBeLessThan(15);
    if (n === 13) await shot(page, "lightbox-rapid-after");
  };

  const next = page.getByRole("button", { name: "Next photo" });
  for (let n = 2; n <= 31; n += 1) {
    await next.click();
    await show(n);
  }

  const stage = await page.locator("[data-photo-stage]").boundingBox();
  expect(stage).not.toBeNull();
  for (let n = 32; n <= 41; n += 1) {
    const y = stage!.y + stage!.height * 0.42;
    await page.mouse.move(stage!.x + stage!.width - 90, y);
    await page.mouse.down();
    await page.mouse.move(stage!.x + 70, y, { steps: 8 });
    await page.mouse.up();
    await show(n);
  }

  await page.waitForTimeout(1200);
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-41.jpg");
  await expect(page.locator("[data-photo-image] img")).toHaveCount(1);
  await expect(page.locator("[data-photo-image] img")).toHaveAttribute("data-photo-id", "41");
  const settled = await page.locator("[data-photo-image]").screenshot();
  const settledBox = await page.locator("[data-photo-image]").boundingBox();
  const settledColor = pngPixel(settled, (settledBox?.width ?? 2) / 2, (settledBox?.height ?? 2) / 2);
  expect(Math.abs(settledColor.r - 41 * 6)).toBeLessThanOrEqual(2);
  expect(Math.abs(settledColor.b - 40)).toBeLessThanOrEqual(8);
});

test("one arrow tap moves exactly one photo", async ({ page }) => {
  await page.goto("/dev/lightbox?at=28");
  await viewerReady(page);
  await expect(page.locator("[data-photo-count]")).toHaveText("28 / 89");
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-29.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("29 / 89");
  expect(await imageIds(page)).toEqual(["29"]);
});

test("vertical swipes do not scroll the page or move the lightbox, horizontal swipes change photos", async ({
  page,
}) => {
  await page.goto("/dev/lightbox?open=0");
  const marker = page.locator("[data-scroll-marker]");
  const before = await marker.boundingBox();
  expect(before).not.toBeNull();
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const scrolled = await marker.boundingBox();
  expect(scrolled!.y).toBeLessThan(before!.y - 40);

  await page.getByRole("button", { name: "Open photo" }).click();
  const viewer = page.locator("[data-photo-viewer]");
  await expect(viewer).toBeVisible();
  const opened = await viewer.boundingBox();
  const backdrop = await page.locator("[data-photo-backdrop]").boundingBox();
  expect(backdrop!.x).toBeLessThanOrEqual(opened!.x);
  expect(backdrop!.y).toBeLessThanOrEqual(opened!.y);
  expect(backdrop!.x + backdrop!.width).toBeGreaterThanOrEqual(opened!.x + opened!.width);
  expect(backdrop!.y + backdrop!.height).toBeGreaterThanOrEqual(opened!.y + opened!.height);
  const dimmed = pngPixel(await page.screenshot(), 8, 132);
  expect(dimmed.r).toBeGreaterThan(6);
  expect(dimmed.r).toBeLessThan(20);
  expect(opened?.x).toBe(0);
  expect(opened?.y).toBe(0);
  expect(opened?.width).toBe(393);
  expect(opened?.height).toBe(852);
  const locked = await marker.boundingBox();

  await page.mouse.move(180, 640);
  await page.mouse.down();
  await page.mouse.move(180, 180, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, 700);

  const after = await marker.boundingBox();
  expect(after?.y).toBeCloseTo(locked?.y ?? 0, 0);
  const stayed = await viewer.boundingBox();
  expect(stayed).toEqual(opened);

  await expect(page.locator("[data-photo-count]")).toHaveText("1 / 89");
  const stage = await page.locator("[data-photo-stage]").boundingBox();
  expect(stage).not.toBeNull();
  await page.mouse.move(stage!.x + stage!.width - 90, stage!.y + stage!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + 70, stage!.y + stage!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("[data-photo-count]")).toHaveText("2 / 89");
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-02.jpg");
  const afterSwipe = await viewer.boundingBox();
  expect(afterSwipe).toEqual(opened);
  expectSeated(await seated(page), 300);
});

async function reelCenterDelta(page: Page) {
  return page.evaluate(() => {
    const reel = document.querySelector("[data-photo-reel]");
    const thumb = reel?.querySelector("[aria-current='true']");
    if (!reel || !thumb) return null;
    const reelBox = reel.getBoundingClientRect();
    const thumbBox = thumb.getBoundingClientRect();
    return Math.abs(thumbBox.left + thumbBox.width / 2 - (reelBox.left + reelBox.width / 2));
  });
}

async function exerciseReel(page: Page, minWidth: number) {
  await viewerReady(page);
  await expect(page.locator("[data-reel-thumb]")).toHaveCount(89);
  const srcs = await page.locator("[data-reel-thumb]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("src")),
  );
  expect(srcs.every((src) => src?.includes("thumb=1"))).toBe(true);
  await expect(page.locator("[data-photo-image] img")).toHaveCount(1);
  await expect.poll(() => page.locator("[data-photo-original]").count()).toBe(1);
  const mainSrc = await page.locator("[data-photo-original]").getAttribute("src");
  expect(mainSrc).not.toContain("thumb");

  for (let step = 0; step < 20; step += 1) {
    const id = String(step + 1).padStart(2, "0");
    await expect(page.locator("[data-photo-count]")).toHaveText(`${step + 1} / 89`);
    await expect(page.locator("[data-photo-reel] [aria-current='true']")).toHaveAttribute("data-reel-id", id);
    expectSeated(await seated(page), minWidth);
    await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);
    await page.getByRole("button", { name: "Next photo" }).click();
  }

  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-21.jpg");
  expectSeated(await seated(page), minWidth);
  await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-photo-count]")).toHaveText("22 / 89");
  await expect(page.locator("[data-photo-reel] [aria-current='true']")).toHaveAttribute("data-reel-id", "22");
  expectSeated(await seated(page), minWidth);
  await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);

  await page.locator("[data-photo-reel]").evaluate((el) => {
    el.scrollLeft = 520;
  });
  await expect(page.locator("[data-photo-count]")).toHaveText("22 / 89");
  expect(await reelCenterDelta(page)).toBeGreaterThan(20);

  await page.locator("[data-reel-id='40']").click();
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-40.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("40 / 89");
  await expect(page.locator("[data-photo-reel] [aria-current='true']")).toHaveCount(1);
  await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);
  expectSeated(await seated(page), minWidth);

  const paint = await page.locator("[data-photo-reel] [aria-current='true']").evaluate((el) => {
    const style = getComputedStyle(el);
    return { opacity: style.opacity, border: style.borderTopColor };
  });
  expect(paint.opacity).toBe("1");
  expect(paint.border).toBe("rgb(255, 255, 255)");
  const dim = await page.locator("[data-reel-id='39']").evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(dim).toBeLessThan(0.6);

  const gestures = await page.evaluate(() => {
    const reel = document.querySelector("[data-photo-reel]");
    const stage = document.querySelector("[data-photo-stage]");
    const reelEvent = new WheelEvent("wheel", { deltaX: 40, bubbles: true, cancelable: true });
    reel?.dispatchEvent(reelEvent);
    const stageEvent = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true });
    stage?.dispatchEvent(stageEvent);
    return { reel: reelEvent.defaultPrevented, stage: stageEvent.defaultPrevented };
  });
  expect(gestures.reel).toBe(false);
  expect(gestures.stage).toBe(true);
}

test("filename stays above the photo across 20 navigations and the reel follows", async ({ page }) => {
  await page.goto("/dev/lightbox");
  await exerciseReel(page, 300);
  await shot(page, "lightbox-reel-jumped");
});

test("filename stays seated on a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/lightbox");
  const viewer = page.locator("[data-photo-viewer]");
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  await expectReelThumbs(page, 96, 64);
  await exerciseReel(page, 300);
  await shot(page, "lightbox-desktop-1440");
});

test("portrait photos keep the reel on the photo on phone and desktop", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/dev/lightbox?shape=portrait");
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-01.jpg");
  await expect.poll(async () => (await seated(page))?.natural ?? 0).toBeGreaterThan(0.6);
  const phone = await seated(page);
  expectSeated(phone, 200);
  expect(Math.abs(phone!.natural - 1000 / 1500)).toBeLessThan(0.05);
  expect(Math.abs(phone!.shown - phone!.natural)).toBeLessThan(0.05);
  expect(phone!.spaceBelow).toBeGreaterThan(24);
  await expectReelThumbs(page, 60, 40);
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(page.locator("[data-photo-count]")).toHaveText("2 / 89");
  await expect(page.locator("[data-photo-reel] [aria-current='true']")).toHaveAttribute("data-reel-id", "02");
  expectSeated(await seated(page), 200);
  await page.locator("[data-reel-id='15']").click();
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-15.jpg");
  await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);
  expectSeated(await seated(page), 200);
  await shot(page, "lightbox-portrait-393");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await seated(page))?.width ?? 0).toBeGreaterThan(400);
  const desktop = await seated(page);
  expectSeated(desktop, 300);
  expect(Math.abs(desktop!.shown - desktop!.natural)).toBeLessThan(0.05);
  await expectReelThumbs(page, 96, 64);
  await expect(page.locator("[data-photo-reel] [aria-current='true']")).toHaveAttribute("data-reel-id", "15");
  await expect.poll(() => reelCenterDelta(page)).toBeLessThan(2);
  await shot(page, "lightbox-portrait-1440");
});

test("filename stays seated before the original loads and after the viewport changes", async ({ page }) => {
  await page.route("**/dev/photos/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("thumb")) await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/dev/lightbox", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-01.jpg");
  expectSeated(await seated(page), 300);

  await page.setViewportSize({ width: 1440, height: 900 });
  expectSeated(await seated(page), 300);
  await page.setViewportSize({ width: 393, height: 700 });
  expectSeated(await seated(page), 280);

  await expect
    .poll(() => page.locator("[data-photo-original]").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expectSeated(await seated(page), 280);
  expect((await seated(page))!.nameTop).toBeGreaterThan((await seated(page))!.headerBottom);
});
