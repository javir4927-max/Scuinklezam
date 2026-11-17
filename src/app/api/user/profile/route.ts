import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/userAuth";
import { getUserProfileData, RANKED_CATEGORIES } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({
        success: true,
        authenticated: false,
      });
    }

    const data = await getUserProfileData(user.id);

    // Resolve human-readable category name for best category
    const bestCat = RANKED_CATEGORIES.find((c) => c.id === data.bestCategoryId);

    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
      stats: {
        ...data,
        bestCategoryName: bestCat?.name || (data.bestCategoryId ? data.bestCategoryId.replace(/^(artist_|theme_)/, "").replace(/_/g, " ") : "Ninguno aún"),
      },
    });
  } catch (err: any) {
    console.error("[api/user/profile error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al cargar perfil" },
      { status: 500 }
    );
  }
}
