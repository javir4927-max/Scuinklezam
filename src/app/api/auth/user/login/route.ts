import { NextResponse } from "next/server";
import { loginUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    const res = await loginUser(email || "", password || "");
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 401 });
    }

    return NextResponse.json({ success: true, user: res.user });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Error al iniciar sesión." },
      { status: 500 }
    );
  }
}
