import { NextResponse } from "next/server";
import { RANKED_TIERS } from "@/lib/rankedTypes";
import { getDynamicRankedCategories } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET() {
  const categories = await getDynamicRankedCategories();

  return NextResponse.json(
    {
      success: true,
      categories,
      tiers: RANKED_TIERS,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
