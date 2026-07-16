import type { NextFunction, Request, Response } from "express";
import { PrivyClient } from "@privy-io/node";
import { config } from "./config.js";
import { prisma } from "./db.js";

const privy = new PrivyClient({ appId: config.PRIVY_APP_ID, appSecret: config.PRIVY_APP_SECRET, ...(config.PRIVY_VERIFICATION_KEY ? { jwtVerificationKey: config.PRIVY_VERIFICATION_KEY } : {}) });
export interface AuthRequest extends Request { user?: { id: string; privyDid: string; email: string | null; displayName: string | null } }

export async function verifyToken(token?: string): Promise<{ userId: string }> {
  if (config.ALLOW_DEMO_AUTH && token === "demo-token") return { userId: "did:privy:demo-user" };
  if (!token) throw new Error("Missing access token");
  const claims = await privy.utils().auth().verifyAccessToken(token);
  return { userId: claims.user_id };
}

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const claims = await verifyToken(token);
    let user = await prisma.user.upsert({
      where: { privyDid: claims.userId }, update: {},
      create: { privyDid: claims.userId, wallet: { create: { cashBalance: config.STARTING_BALANCE } } }
    });
    if (!user.email && config.ALLOW_DEMO_AUTH) user = await prisma.user.update({ where: { id: user.id }, data: { email: "demo@kraft.trade" } });
    if (!user.email && !config.ALLOW_DEMO_AUTH) {
      const remote = await privy.users()._get(claims.userId);
      const account = remote.linked_accounts.find(item => item.type === "email") ?? remote.linked_accounts.find(item => "email" in item && typeof item.email === "string");
      const email = account?.type === "email" ? account.address : account && "email" in account ? account.email : null;
      if (email) user = await prisma.user.update({ where: { id: user.id }, data: { email } });
    }
    req.user = { id: user.id, privyDid: user.privyDid, email: user.email, displayName: user.displayName }; next();
  } catch { res.status(401).json({ error: "Unauthorized" }); }
}
