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

async function imageIds(page: Page) {
  return page.locator("[data-photo-viewer] img").evaluateAll((images) =>
    images.map((image) => image.getAttribute("data-photo-id")),
  );
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

  const background = await page.locator("[data-photo-backdrop]").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toBe("rgba(0, 0, 0, 0.9)");

  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-01.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("1 / 40");

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

  const screen = await shot(page, "lightbox-webkit-393");
  const png = await page.screenshot();
  const pixel = pngPixel(png, 200, 132);
  expect(pixel.r).toBeGreaterThan(8);
  expect(pixel.r).toBeLessThan(60);
  expect(pixel.g).toBeLessThan(20);
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
  const next = page.getByRole("button", { name: "Next photo" });
  for (let step = 0; step < 10; step += 1) {
    await next.click();
    const label = String(step + 2).padStart(2, "0");
    await expect(page.locator("[data-photo-filename]")).toHaveText(`Full-${label}.jpg`);
    await expect(page.locator("[data-photo-count]")).toHaveText(`${step + 2} / 40`);
    await expect(page.locator("[data-photo-index]")).toHaveAttribute("data-photo-index", String(step + 1));
    const ids = await imageIds(page);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(new Set(ids)).toEqual(new Set([label]));
  }

  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Next photo"]');
    for (let tap = 0; tap < 10; tap += 1) button?.click();
  });
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-21.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("21 / 40");
  expect(new Set(await imageIds(page))).toEqual(new Set(["21"]));

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
  expect(new Set(await imageIds(page))).toEqual(new Set(["21"]));
  const painted = await page.locator("[data-photo-image]").screenshot();
  const box = await page.locator("[data-photo-image]").boundingBox();
  const color = pngPixel(painted, (box?.width ?? 10) / 2, (box?.height ?? 10) / 2);
  expect(color.r).toBeGreaterThanOrEqual(21 * 6 - 2);
  expect(color.r).toBeLessThanOrEqual(21 * 6 + 2);

  await shot(page, "lightbox-after-rapid-taps");
});

test("one arrow tap moves exactly one photo", async ({ page }) => {
  await page.goto("/dev/lightbox?at=28");
  await expect(page.locator("[data-photo-count]")).toHaveText("28 / 40");
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-29.jpg");
  await expect(page.locator("[data-photo-count]")).toHaveText("29 / 40");
  expect(new Set(await imageIds(page))).toEqual(new Set(["29"]));
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

  await expect(page.locator("[data-photo-count]")).toHaveText("1 / 40");
  const stage = await page.locator("[data-photo-stage]").boundingBox();
  expect(stage).not.toBeNull();
  await page.mouse.move(stage!.x + stage!.width - 90, stage!.y + stage!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + 70, stage!.y + stage!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("[data-photo-count]")).toHaveText("2 / 40");
  await expect(page.locator("[data-photo-filename]")).toHaveText("Full-02.jpg");
  const afterSwipe = await viewer.boundingBox();
  expect(afterSwipe).toEqual(opened);
});
