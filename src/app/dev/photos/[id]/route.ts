export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > 89) {
    return new Response("Not found", { status: 404 });
  }
  const portrait = new URL(request.url).searchParams.get("shape") === "portrait";
  const width = portrait ? 1000 : 1600;
  const height = portrait ? 1500 : 1000;
  const red = n * 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="rgb(${red}, 20, 40)"/></svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "no-store",
    },
  });
}
