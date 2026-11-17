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

  response.cookies.set("spotify_user_connected", "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("spotify_user_name", "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("spotify_user_avatar", "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
