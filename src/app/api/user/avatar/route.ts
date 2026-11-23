import { NextResponse } from "next/server";
import { getUserCustomization } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
  }

  const custom = await getUserCustomization(uid);

  if (custom?.customAvatarUrl?.startsWith("data:image/")) {
    const matches = custom.customAvatarUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1] || "image/png";
      const buffer = Buffer.from(matches[2], "base64");
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  if (custom?.customAvatarUrl?.startsWith("https://")) {
    return NextResponse.redirect(custom.customAvatarUrl, 307);
  }

  const fallback = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(uid)}&backgroundColor=0B1710`;
  return NextResponse.redirect(fallback, 307);
}
