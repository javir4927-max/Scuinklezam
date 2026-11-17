import { NextResponse } from "next/server";
import { getArtistFacePhoto, PRELOADED_ARTIST_PHOTOS } from "@/lib/artistPhotos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const namesParam = searchParams.get("names") || "";

  if (!namesParam.trim()) {
    return NextResponse.json({ photos: PRELOADED_ARTIST_PHOTOS });
  }

  const names = namesParam
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const results: Record<string, string> = {};

  await Promise.all(
    names.map(async (name) => {
      results[name] = await getArtistFacePhoto(name);
    })
  );

  return NextResponse.json({ photos: results });
}
