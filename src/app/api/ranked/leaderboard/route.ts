import { NextResponse } from "next/server";
import { getCategoryLeaderboard } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category") || "artist_bad_bunny";
  const userId = searchParams.get("userId") || undefined;

  const data = await getCategoryLeaderboard(categoryId, userId);
  return NextResponse.json({ success: true, ...data });
}
