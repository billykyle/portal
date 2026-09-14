import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Billy Kyle";
export const OG_TYPE = "image/png";

const whiteLogoSrc = readFile(join(process.cwd(), "public/brand/bk-logo-white.png")).then(
  (bytes) => `data:image/png;base64,${bytes.toString("base64")}`,
);

export async function brandMarkImage(size: { width: number; height: number }, markHeight: number) {
  const src = await whiteLogoSrc;
  return new ImageResponse(
    (
      <div
        style={{
          background: "#000000",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* OG/icon routes render through Satori — next/image is not available here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} height={markHeight} alt="" />
      </div>
    ),
    size,
  );
}
