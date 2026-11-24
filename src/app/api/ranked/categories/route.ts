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
  try {
    const categories = await getDynamicRankedCategories();

    return NextResponse.json(
      {
        success: true,
        categories,
        tiers: RANKED_TIERS,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error("[GET /api/ranked/categories] Error:", err);
    return NextResponse.json(
      { success: false, error: "Error cargando categorías de Ranked" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
