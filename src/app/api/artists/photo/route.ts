import { NextResponse } from "next/server";
import { getArtistFacePhoto } from "@/lib/artistPhotos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "";
  const format = searchParams.get("format");

  if (!name.trim()) {
    return NextResponse.json(
      { success: false, error: "Nombre de artista no proporcionado" },
      { status: 400 }
    );
  }

  const photoUrl = await getArtistFacePhoto(name);

  const acceptsJson =
    format === "json" ||
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "XMLHttpRequest";

  if (acceptsJson) {
    return NextResponse.json(
      { success: true, name, url: photoUrl },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        },
      }
    );
  }

  // Redirect for direct use in <img src="/api/artists/photo?name=..." />
  return NextResponse.redirect(photoUrl, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
