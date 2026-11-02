import { Request } from "express";

export type Role = "student" | "organizer" | "admin";

export interface AuthUser {
  user_id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  year_of_study: string | null;
  phone: string | null;
  is_active: number;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}
