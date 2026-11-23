import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
  const isConfigured = clientId.length > 5 && clientSecret.length > 5;

  const masked = clientId
    ? `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}`
    : "";

  return NextResponse.json({
    configured: isConfigured,
    clientIdMasked: masked,
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "La configuración no se puede modificar en producción." },
      { status: 403 }
    );
  }
  try {
    const body = await request.json();
    const clientId = (body.clientId || "").trim();
    const clientSecret = (body.clientSecret || "").trim();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: "Debes proporcionar Client ID y Client Secret." },
        { status: 400 }
      );
    }

    // Update in-memory process.env
    process.env.SPOTIFY_CLIENT_ID = clientId;
    process.env.SPOTIFY_CLIENT_SECRET = clientSecret;

    // Persist to .env.local
    const envPath = path.join(process.cwd(), ".env.local");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    if (content.includes("SPOTIFY_CLIENT_ID=")) {
      content = content.replace(/SPOTIFY_CLIENT_ID=.*(\r?\n|$)/, `SPOTIFY_CLIENT_ID=${clientId}$1`);
    } else {
      content += `\nSPOTIFY_CLIENT_ID=${clientId}\n`;
    }

    if (content.includes("SPOTIFY_CLIENT_SECRET=")) {
      content = content.replace(/SPOTIFY_CLIENT_SECRET=.*(\r?\n|$)/, `SPOTIFY_CLIENT_SECRET=${clientSecret}$1`);
    } else {
      content += `SPOTIFY_CLIENT_SECRET=${clientSecret}\n`;
    }

    if (!content.includes("NEXT_PUBLIC_APP_URL=")) {
      content += `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000\n`;
    }

    fs.writeFileSync(envPath, content, "utf-8");

    return NextResponse.json({
      success: true,
      message: "Claves de Spotify guardadas correctamente en .env.local",
    });
  } catch (error: any) {
    console.error("Error saving Spotify config:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al guardar la configuración" },
      { status: 500 }
    );
  }
}
