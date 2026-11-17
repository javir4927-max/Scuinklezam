import crypto from "crypto";
import { cookies } from "next/headers";
import { redis } from "./roomStore";

export interface UserAccount {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
  salt: string;
  avatarUrl: string;
  createdAt: number;
  spotifyConnected?: boolean;
}

export interface UserSession {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string;
  provider?: "email" | "spotify";
}

// In-memory fallback if Redis is unreachable
declare global {
  // eslint-disable-next-line no-var
  var __scuinklezamUsers: Map<string, UserAccount> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamSessions: Map<string, string> | undefined;
}

if (!global.__scuinklezamUsers) {
  global.__scuinklezamUsers = new Map<string, UserAccount>();
}
if (!global.__scuinklezamSessions) {
  global.__scuinklezamSessions = new Map<string, string>();
}

const memoryUsers = global.__scuinklezamUsers;
const memorySessions = global.__scuinklezamSessions;

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export async function registerUser(
  emailInput: string,
  nicknameInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserSession; error?: string }> {
  const email = emailInput.trim().toLowerCase();
  const nickname = nicknameInput.trim();
  const password = passwordInput.trim();

  if (!email || !email.includes("@")) {
    return { success: false, error: "Introduce un correo electrónico válido." };
  }
  if (!nickname || nickname.length < 2) {
    return { success: false, error: "El nickname debe tener al menos 2 caracteres." };
  }
  if (!password || password.length < 4) {
    return { success: false, error: "La contraseña debe tener al menos 4 caracteres." };
  }

  // Check if user already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { success: false, error: "Ya existe una cuenta con este correo electrónico." };
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=0B1710`;

  const newAccount: UserAccount = {
    id: userId,
    email,
    nickname,
    passwordHash,
    salt,
    avatarUrl,
    createdAt: Date.now(),
  };

  memoryUsers.set(email, newAccount);
  memoryUsers.set(userId, newAccount);

  if (redis) {
    try {
      await redis.set(`scuinklezam:user:${email}`, JSON.stringify(newAccount));
      await redis.set(`scuinklezam:user_by_id:${userId}`, email);
    } catch (err) {
      console.warn("[registerUser] Redis save warning:", err);
    }
  }

  const sessionToken = await createSession(userId);
  await setSessionCookie(sessionToken, newAccount);

  return {
    success: true,
    user: {
      id: userId,
      email,
      nickname,
      avatarUrl,
    },
  };
}

export async function loginUser(
  emailInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserSession; error?: string }> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput.trim();

  const user = await getUserByEmail(email);
  if (!user) {
    return { success: false, error: "No existe ninguna cuenta con este correo electrónico." };
  }

  const testHash = hashPassword(password, user.salt);
  if (testHash !== user.passwordHash) {
    return { success: false, error: "Contraseña incorrecta." };
  }

  const sessionToken = await createSession(user.id);
  await setSessionCookie(sessionToken, user);

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
    },
  };
}

export async function getUserByEmail(email: string): Promise<UserAccount | null> {
  const lower = email.trim().toLowerCase();
  if (memoryUsers.has(lower)) {
    return memoryUsers.get(lower)!;
  }

  if (redis) {
    try {
      const raw = await redis.get<string | UserAccount>(`scuinklezam:user:${lower}`);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        memoryUsers.set(lower, parsed);
        memoryUsers.set(parsed.id, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn("[getUserByEmail] Redis read error:", err);
    }
  }

  return null;
}

export async function getUserById(id: string): Promise<UserAccount | null> {
  if (memoryUsers.has(id)) {
    return memoryUsers.get(id)!;
  }

  if (redis) {
    try {
      const email = await redis.get<string>(`scuinklezam:user_by_id:${id}`);
      if (email) {
        return getUserByEmail(email);
      }
    } catch (err) {
      console.warn("[getUserById] Redis read error:", err);
    }
  }

  return null;
}

export async function createSession(userId: string): Promise<string> {
  const token = `ses_${crypto.randomBytes(32).toString("hex")}`;
  memorySessions.set(token, userId);

  if (redis) {
    try {
      // 30 days expiration
      await redis.set(`scuinklezam:session:${token}`, userId, { ex: 30 * 24 * 60 * 60 });
    } catch (err) {
      console.warn("[createSession] Redis set error:", err);
    }
  }

  return token;
}

export async function getSessionUser(): Promise<UserSession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get("scuinklezam_session")?.value;

  if (token) {
    let userId = memorySessions.get(token);
    if (!userId && redis) {
      try {
        const res = await redis.get<string>(`scuinklezam:session:${token}`);
        if (res) userId = res;
      } catch (err) {
        console.warn("[getSessionUser] Redis get error:", err);
      }
    }

    if (userId) {
      const user = await getUserById(userId);
      if (user) {
        return {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          provider: "email",
        };
      }
    }
  }

  // Check Spotify login
  const spotifyConnected = cookieStore.get("spotify_user_connected")?.value === "1";
  const spotifyName = cookieStore.get("spotify_user_name")?.value;
  const spotifyAvatar = cookieStore.get("spotify_user_avatar")?.value;
  const spotifyId = cookieStore.get("spotify_user_id")?.value;

  if (spotifyConnected && spotifyName) {
    const cleanName = decodeURIComponent(spotifyName);
    const cleanAvatar = spotifyAvatar
      ? decodeURIComponent(spotifyAvatar)
      : `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=0B1710`;
    const cleanId = spotifyId
      ? `spotify_${spotifyId}`
      : `spotify_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

    return {
      id: cleanId,
      email: `${cleanId}@spotify.scuinklezam.app`,
      nickname: cleanName,
      avatarUrl: cleanAvatar,
      provider: "spotify",
    };
  }

  return null;
}

export async function setSessionCookie(token: string, user: UserAccount) {
  const cookieStore = cookies();
  const isSecure = process.env.NODE_ENV === "production";

  cookieStore.set("scuinklezam_session", token, {
    httpOnly: true,
    secure: isSecure,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    sameSite: "lax",
  });

  cookieStore.set(
    "scuinklezam_user",
    JSON.stringify({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
    }),
    {
      httpOnly: false,
      secure: isSecure,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    }
  );
}

export async function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set("scuinklezam_session", "", { path: "/", maxAge: 0 });
  cookieStore.set("scuinklezam_user", "", { path: "/", maxAge: 0 });
}
