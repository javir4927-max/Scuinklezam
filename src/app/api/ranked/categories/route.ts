import { NextResponse } from "next/server";
import { RANKED_CATEGORIES, RANKED_TIERS } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    categories: RANKED_CATEGORIES,
    tiers: RANKED_TIERS,
  });
}
