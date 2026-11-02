import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";
import { AuthUser, AuthedRequest, Role } from "./types";
import { RowDataPacket } from "mysql2";

const secret = () => process.env.JWT_SECRET || "dev-secret-change-me-please-32ch";

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.user_id, role: user.role }, secret(), { expiresIn: "12h" });
}

export function requireAuth(roles?: Role[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "Authorization required" });
      return;
    }
    try {
      const payload = jwt.verify(token, secret()) as { sub: number | string; role: Role };
      const rows = await query<(AuthUser & RowDataPacket)[]>(
        "SELECT user_id, name, email, role, department, year_of_study, phone, is_active FROM users WHERE user_id = ?",
        [Number(payload.sub)]
      );
      const user = rows[0];
      if (!user || !user.is_active) {
        res.status(401).json({ error: "Invalid account" });
        return;
      }
      if (roles && !roles.includes(user.role)) {
        res.status(403).json({ error: "You do not have permission for this action" });
        return;
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid authentication token" });
    }
  };
}

export function optionalAuth() {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      next();
      return;
    }
    try {
      const payload = jwt.verify(token, secret()) as { sub: number | string };
      const rows = await query<(AuthUser & RowDataPacket)[]>(
        "SELECT user_id, name, email, role, department, year_of_study, phone, is_active FROM users WHERE user_id = ?",
        [Number(payload.sub)]
      );
      if (rows[0]) req.user = rows[0];
    } catch {
      /* ignore */
    }
    next();
  };
}
