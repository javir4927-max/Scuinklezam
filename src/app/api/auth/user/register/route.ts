import { NextResponse } from "next/server";
import { registerUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, nickname, password } = body;

    const res = await registerUser(email || "", nickname || "", password || "");
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: res.user });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Error al registrar usuario." },
      { status: 500 }
    );
  }
}
