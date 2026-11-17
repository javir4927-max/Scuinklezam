import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true, message: "Sesión cerrada correctamente." });
}

export async function GET() {
  return POST();
}
