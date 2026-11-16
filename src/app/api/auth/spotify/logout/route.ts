import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const response = NextResponse.json({
    success: true,
    message: "Sesión de Spotify cerrada correctamente",
  });

  response.cookies.set("spotify_access_token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
  });

  response.cookies.set("spotify_refresh_token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
  });

  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
