import { NextResponse } from "next/server";
import { getSessionUser, getUserCustomization, setUserCustomization, resolvePublicAvatarUrl } from "@/lib/userAuth";
import { getUserProfileData, RANKED_CATEGORIES } from "@/lib/rankedStore";
import { calculateTier, RankedTierName } from "@/lib/rankedTypes";
import { redis } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

const TIER_RANK_WEIGHT: Record<RankedTierName, number> = {
  Maestro: 6,
  Diamante: 5,
  Platino: 4,
  Oro: 3,
  Plata: 2,
  Bronce: 1,
};

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
    const customization = await getUserCustomization(user.id);

    // Resolve human-readable category name for best category
    const bestCat = RANKED_CATEGORIES.find((c) => c.id === data.bestCategoryId);
    const bestCatName =
      bestCat?.name ||
      (data.bestCategoryId
        ? data.bestCategoryId.replace(/^(artist_|theme_)/, "").replace(/_/g, " ")
        : "");

    // Calculate highestTier from bestScore and averageScore
    const bestTierObj = calculateTier(data.bestScore);
    const avgTierObj = calculateTier(data.averageScore);
    const highestTier: RankedTierName =
      TIER_RANK_WEIGHT[bestTierObj.name] >= TIER_RANK_WEIGHT[avgTierObj.name]
        ? bestTierObj.name
        : avgTierObj.name;

    // Calculate unlocked titles
    const unlockedTitles: string[] = ["Novato Musical", "Oído Fino"];

    if (data.totalPlays >= 5) {
      unlockedTitles.push("Veterano Ranked");
    }

    const tierWeight = TIER_RANK_WEIGHT[highestTier] || 1;
    if (tierWeight >= TIER_RANK_WEIGHT.Oro) {
      unlockedTitles.push("Rango Oro");
    }
    if (tierWeight >= TIER_RANK_WEIGHT.Platino) {
      unlockedTitles.push("Rango Platino");
    }
    if (tierWeight >= TIER_RANK_WEIGHT.Diamante) {
      unlockedTitles.push("Rango Diamante");
    }
    if (tierWeight >= TIER_RANK_WEIGHT.Maestro) {
      unlockedTitles.push("Maestro Musical");
    }

    if (data.bestScore >= 700 && bestCatName) {
      unlockedTitles.push(`Fan de ${bestCatName}`);
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
      stats: {
        ...data,
        bestCategoryName: bestCatName || "Ninguno aún",
      },
      customization: {
        customAvatarUrl: customization.customAvatarUrl
          ? resolvePublicAvatarUrl(user.id, customization, user.avatarUrl)
          : null,
        equippedTitle: customization.equippedTitle || null,
      },
      highestTier,
      unlockedTitles,
    });
  } catch (err: any) {
    console.error("[api/user/profile error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al cargar perfil" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    let { customAvatarUrl, equippedTitle } = body;

    // Validate customAvatarUrl if provided
    if (typeof customAvatarUrl === "string") {
      customAvatarUrl = customAvatarUrl.trim();
      const isBase64 = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(customAvatarUrl);
      const isDiceBear = customAvatarUrl.startsWith("https://api.dicebear.com/");

      if (!isBase64 && !isDiceBear) {
        return NextResponse.json(
          {
            success: false,
            error: "Formato de imagen no permitido. Usa una foto recortada o un avatar de la lista.",
          },
          { status: 400 }
        );
      }

      if (isBase64 && customAvatarUrl.length > 65000) {
        return NextResponse.json(
          {
            success: false,
            error: "La imagen es demasiado grande (máximo 65KB).",
          },
          { status: 400 }
        );
      }
    } else if (customAvatarUrl !== null && customAvatarUrl !== undefined) {
      customAvatarUrl = null;
    }

    if (equippedTitle !== null && equippedTitle !== undefined) {
      equippedTitle = String(equippedTitle).trim().slice(0, 50);
      if (equippedTitle === "" || equippedTitle === "Sin título") {
        equippedTitle = null;
      }
    }

    const current = await getUserCustomization(user.id);
    const updated = {
      ...current,
      customAvatarUrl: customAvatarUrl !== undefined ? customAvatarUrl : current.customAvatarUrl,
      equippedTitle: equippedTitle !== undefined ? equippedTitle : current.equippedTitle,
      updatedAt: Date.now(),
    };

    await setUserCustomization(user.id, updated);

    // Sync to user_profile in Redis if custom avatar was updated, storing the compact public URL (never huge Base64!)
    if (redis) {
      try {
        const rawProfile = await redis.get<string | any>(`scuinklezam:user_profile:${user.id}`);
        if (rawProfile) {
          const prof = typeof rawProfile === "string" ? JSON.parse(rawProfile) : rawProfile;
          prof.avatarUrl = resolvePublicAvatarUrl(user.id, updated, user.avatarUrl);
          await redis.set(`scuinklezam:user_profile:${user.id}`, JSON.stringify(prof));
        }
      } catch (err) {
        console.warn("[PATCH /api/user/profile] Redis sync user_profile error:", err);
      }
    }

    return NextResponse.json({
      success: true,
      customization: updated,
    });
  } catch (err: any) {
    console.error("[PATCH /api/user/profile] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al guardar personalización" },
      { status: 500 }
    );
  }
}
