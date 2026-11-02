import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import { RowDataPacket } from "mysql2";
import { execute, query } from "./db";
import { optionalAuth, requireAuth, signToken } from "./auth";
import { eventWithCounts, listEvents } from "./events";
import { notify } from "./notify";
import { AuthUser, AuthedRequest } from "./types";

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
fs.mkdirSync(path.join(uploadDir, "banners"), { recursive: true });

const upload = multer({
  dest: path.join(uploadDir, "banners"),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|webp|gif)/.test(file.mimetype);
    if (!ok) {
      cb(new Error("Unsupported image type"));
      return;
    }
    cb(null, true);
  },
});

export const api = Router();

function publicUser(user: AuthUser) {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    year_of_study: user.year_of_study,
    phone: user.phone,
    is_active: Boolean(user.is_active),
  };
}

api.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "campusconnect-api" });
});

api.post("/auth/register", async (req, res) => {
  const { name, email, password, role = "student", department, year_of_study, phone } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: "Name is required" });
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!["student", "organizer"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  const exists = await query<RowDataPacket[]>("SELECT user_id FROM users WHERE email = ?", [String(email).toLowerCase()]);
  if (exists.length) return res.status(409).json({ error: "An account with this email already exists" });
  const result = await execute(
    "INSERT INTO users (name, email, password_hash, role, department, year_of_study, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      String(name).trim(),
      String(email).toLowerCase(),
      bcrypt.hashSync(password, 10),
      role,
      department || null,
      year_of_study || null,
      phone || null,
    ]
  );
  const rows = await query<(AuthUser & RowDataPacket)[]>(
    "SELECT user_id, name, email, role, department, year_of_study, phone, is_active FROM users WHERE user_id = ?",
    [result.insertId]
  );
  const user = rows[0];
  res.status(201).json({ access_token: signToken(user), user: publicUser(user) });
});

api.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const rows = await query<(AuthUser & { password_hash: string } & RowDataPacket)[]>(
    "SELECT user_id, name, email, role, department, year_of_study, phone, is_active, password_hash FROM users WHERE email = ?",
    [String(email || "").toLowerCase()]
  );
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }
  if (!user.is_active) return res.status(403).json({ error: "This account has been deactivated" });
  res.json({ access_token: signToken(user), user: publicUser(user) });
});

api.get("/auth/me", requireAuth(), (req: AuthedRequest, res) => {
  res.json(publicUser(req.user!));
});

api.get("/events/categories", (_req, res) => {
  res.json(["Technical", "Cultural", "Sports", "Workshop", "Seminar", "Hackathon", "Social", "General"]);
});

api.get("/events", optionalAuth(), async (req: AuthedRequest, res) => {
  const events = await listEvents({
    role: req.user?.role,
    userId: req.user?.user_id,
    status: String(req.query.status || ""),
    category: String(req.query.category || ""),
    q: String(req.query.q || ""),
    mine: req.query.mine === "true",
  });
  res.json(events);
});

api.get("/events/:id", optionalAuth(), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  const user = req.user;
  if (event.status !== "published") {
    const allowed =
      user &&
      (user.role === "admin" || (user.role === "organizer" && user.user_id === event.organizer_id));
    if (!allowed) return res.status(404).json({ error: "Event is not available" });
  }
  let my_registration = null;
  if (user) {
    const regs = await query<RowDataPacket[]>(
      "SELECT * FROM registrations WHERE user_id = ? AND event_id = ?",
      [user.user_id, event.event_id]
    );
    if (regs[0]) my_registration = await shapeRegistration(regs[0]);
  }
  res.json({ ...event, my_registration });
});

api.post("/events", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const body = req.body || {};
  if (!body.event_name || String(body.event_name).length < 3) {
    return res.status(400).json({ error: "Event name is required" });
  }
  if (!body.description || String(body.description).length < 10) {
    return res.status(400).json({ error: "Description is too short" });
  }
  if (!body.event_date || !body.venue || !body.capacity) {
    return res.status(400).json({ error: "Date, venue and capacity are required" });
  }
  const result = await execute(
    `INSERT INTO events (event_name, description, organizer_id, event_date, registration_deadline, venue, capacity, category, eligibility, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      body.event_name,
      body.description,
      req.user!.user_id,
      new Date(body.event_date),
      body.registration_deadline ? new Date(body.registration_deadline) : null,
      body.venue,
      Number(body.capacity),
      body.category || "General",
      body.eligibility || "Open to all students",
    ]
  );
  await notify(req.user!.user_id, `"${body.event_name}" was submitted for administrator approval.`, "event");
  res.status(201).json(await eventWithCounts(result.insertId));
});

api.put("/events/:id", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "You can only edit your own events" });
  }
  const body = req.body || {};
  const status = event.status === "rejected" ? "pending" : event.status;
  await execute(
    `UPDATE events SET event_name=?, description=?, event_date=?, registration_deadline=?, venue=?, capacity=?, category=?, eligibility=?, status=? WHERE event_id=?`,
    [
      body.event_name,
      body.description,
      new Date(body.event_date),
      body.registration_deadline ? new Date(body.registration_deadline) : null,
      body.venue,
      Number(body.capacity),
      body.category || "General",
      body.eligibility || "Open to all students",
      status,
      event.event_id,
    ]
  );
  res.json(await eventWithCounts(event.event_id));
});

api.delete("/events/:id", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "You can only delete your own events" });
  }
  await execute("DELETE FROM events WHERE event_id = ?", [event.event_id]);
  res.json({ message: "Event deleted" });
});

api.post("/events/:id/banner", requireAuth(["organizer", "admin"]), upload.single("file"), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "You can only update your own events" });
  }
  if (!req.file) return res.status(400).json({ error: "Attach an image file" });
  const url = `/api/uploads/banners/${req.file.filename}`;
  await execute("UPDATE events SET banner_url = ? WHERE event_id = ?", [url, event.event_id]);
  res.json(await eventWithCounts(event.event_id));
});

api.get("/events/:id/participants", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT r.*, u.name, u.email, u.department FROM registrations r JOIN users u ON u.user_id = r.user_id
     WHERE r.event_id = ? ORDER BY r.registration_date ASC`,
    [event.event_id]
  );
  const out = [];
  for (const row of rows) out.push(await shapeRegistration(row, true));
  res.json(out);
});

api.get("/events/:id/participants.csv", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT r.*, u.name, u.email, u.department, a.checkin_time FROM registrations r
     JOIN users u ON u.user_id = r.user_id
     LEFT JOIN attendance a ON a.registration_id = r.registration_id
     WHERE r.event_id = ?`,
    [event.event_id]
  );
  const lines = ["Registration ID,Name,Email,Department,Status,Registered At,Attended,Check-in"];
  for (const row of rows) {
    lines.push(
      [row.registration_id, csv(row.name), row.email, csv(row.department), row.status, row.registration_date, row.checkin_time ? "yes" : "no", row.checkin_time || ""].join(",")
    );
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=event-${event.event_id}-participants.csv`);
  res.send(lines.join("\n"));
});

api.post("/events/:id/register", requireAuth(["student"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  const now = new Date();
  if (event.status !== "published") return res.status(400).json({ error: "This event is not open for registration" });
  if (new Date(event.event_date) < now) return res.status(400).json({ error: "This event has already taken place" });
  if (event.registration_deadline && new Date(event.registration_deadline) < now) {
    return res.status(400).json({ error: "Registration deadline has passed" });
  }
  const existing = await query<RowDataPacket[]>(
    "SELECT * FROM registrations WHERE user_id = ? AND event_id = ?",
    [req.user!.user_id, event.event_id]
  );
  if (existing.length) return res.status(409).json({ error: "You are already registered", registration: await shapeRegistration(existing[0]) });
  if (event.registered_count >= event.capacity) return res.status(409).json({ error: "This event is at full capacity" });
  const token = crypto.randomBytes(24).toString("base64url");
  const result = await execute(
    "INSERT INTO registrations (user_id, event_id, qr_token, status) VALUES (?, ?, ?, 'confirmed')",
    [req.user!.user_id, event.event_id, token]
  );
  await notify(req.user!.user_id, `You are registered for "${event.event_name}". Your ticket is ready.`, "registration");
  await notify(event.organizer_id, `${req.user!.name} registered for "${event.event_name}".`, "registration");
  const created = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE registration_id = ?", [result.insertId]);
  res.status(201).json(await shapeRegistration(created[0], false, true));
});

api.get("/registrations/me", requireAuth(), async (req: AuthedRequest, res) => {
  const rows = await query<RowDataPacket[]>(
    "SELECT * FROM registrations WHERE user_id = ? ORDER BY registration_date DESC",
    [req.user!.user_id]
  );
  const out = [];
  for (const row of rows) out.push(await shapeRegistration(row, false, true));
  res.json(out);
});

api.get("/registrations/:id", requireAuth(), async (req: AuthedRequest, res) => {
  const rows = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE registration_id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const shaped = await shapeRegistration(rows[0], true, true);
  const user = req.user!;
  if (user.role === "student" && rows[0].user_id !== user.user_id) return res.status(403).json({ error: "Not authorized" });
  const event = shaped.event as { organizer_id: number } | undefined;
  if (user.role === "organizer" && event?.organizer_id !== user.user_id) return res.status(403).json({ error: "Not authorized" });
  res.json(shaped);
});

api.get("/registrations/:id/qr", requireAuth(), async (req: AuthedRequest, res) => {
  const rows = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE registration_id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const event = await eventWithCounts(rows[0].event_id);
  const user = req.user!;
  const allowed =
    rows[0].user_id === user.user_id ||
    user.role === "admin" ||
    (user.role === "organizer" && event?.organizer_id === user.user_id);
  if (!allowed) return res.status(403).json({ error: "Not authorized" });
  const png = await QRCode.toBuffer(rows[0].qr_token, { width: 280, margin: 1 });
  res.type("png").send(png);
});

api.post("/registrations/:id/cancel", requireAuth(["student"]), async (req: AuthedRequest, res) => {
  const rows = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE registration_id = ?", [req.params.id]);
  if (!rows[0] || rows[0].user_id !== req.user!.user_id) return res.status(403).json({ error: "Not authorized" });
  const attended = await query<RowDataPacket[]>("SELECT attendance_id FROM attendance WHERE registration_id = ?", [req.params.id]);
  if (attended.length) return res.status(400).json({ error: "Attendance already recorded" });
  await execute("DELETE FROM registrations WHERE registration_id = ?", [req.params.id]);
  res.json({ message: "Registration cancelled" });
});

api.post("/attendance/checkin", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const token = String(req.body?.qr_token || "").trim();
  if (!token) return res.status(400).json({ error: "QR token is required", valid: false });
  const rows = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE qr_token = ?", [token]);
  if (!rows[0]) return res.status(404).json({ error: "Invalid ticket", valid: false });
  const registration = rows[0];
  const event = await eventWithCounts(registration.event_id);
  if (req.user!.role === "organizer" && event?.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "This ticket does not belong to one of your events" });
  }
  const existing = await query<RowDataPacket[]>("SELECT * FROM attendance WHERE registration_id = ?", [registration.registration_id]);
  const shaped = await shapeRegistration(registration, true, true);
  if (existing.length) {
    return res.status(409).json({
      error: "Attendance already recorded",
      duplicate: true,
      valid: true,
      registration: shaped,
      attendance: existing[0],
    });
  }
  if (registration.status !== "confirmed") {
    return res.status(400).json({ error: "This registration is not active", valid: false });
  }
  const result = await execute(
    "INSERT INTO attendance (registration_id, marked_by, attendance_status) VALUES (?, ?, 'present')",
    [registration.registration_id, req.user!.user_id]
  );
  await execute("UPDATE registrations SET status = 'attended' WHERE registration_id = ?", [registration.registration_id]);
  await notify(registration.user_id, `Check-in confirmed for "${event?.event_name}".`, "attendance");
  const att = await query<RowDataPacket[]>("SELECT * FROM attendance WHERE attendance_id = ?", [result.insertId]);
  res.json({
    valid: true,
    message: "Attendance recorded",
    registration: await shapeRegistration(registration, true, true),
    attendance: att[0],
  });
});

api.get("/analytics/overview", requireAuth(), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === "admin") {
    const totals = await query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE role='student') AS students,
        (SELECT COUNT(*) FROM users WHERE role='organizer') AS organizers,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM events WHERE status='published') AS published_events,
        (SELECT COUNT(*) FROM events WHERE status='pending') AS pending_events,
        (SELECT COUNT(*) FROM registrations) AS registrations,
        (SELECT COUNT(*) FROM attendance) AS attendance
    `);
    const by_category = await query<RowDataPacket[]>("SELECT category, COUNT(*) AS count FROM events GROUP BY category");
    const recent = await listEvents({ role: "admin" });
    return res.json({ totals: totals[0], by_category, recent_events: recent.slice(0, 6) });
  }
  if (user.role === "organizer") {
    const events = await listEvents({ role: "organizer", userId: user.user_id, mine: true });
    const ids = events.map((e) => e.event_id);
    let registrations = 0;
    let attendance = 0;
    if (ids.length) {
      const r = await query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM registrations WHERE event_id IN (${ids.map(() => "?").join(",")})`, ids);
      const a = await query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM attendance a JOIN registrations r ON r.registration_id = a.registration_id WHERE r.event_id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      registrations = Number(r[0].c);
      attendance = Number(a[0].c);
    }
    return res.json({
      totals: {
        events: events.length,
        published_events: events.filter((e) => e.status === "published").length,
        pending_events: events.filter((e) => e.status === "pending").length,
        registrations,
        attendance,
      },
      events,
    });
  }
  const regs = await query<RowDataPacket[]>("SELECT * FROM registrations WHERE user_id = ?", [user.user_id]);
  const out = [];
  for (const row of regs) out.push(await shapeRegistration(row, false, true));
  const attended = await query<RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM attendance a JOIN registrations r ON r.registration_id = a.registration_id WHERE r.user_id = ?",
    [user.user_id]
  );
  res.json({
    totals: { registrations: regs.length, attended: Number(attended[0].c) },
    registrations: out,
  });
});

api.get("/analytics/events/:id", requireAuth(["organizer", "admin"]), async (req: AuthedRequest, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  if (req.user!.role === "organizer" && event.organizer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const att = await query<RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM attendance a JOIN registrations r ON r.registration_id = a.registration_id WHERE r.event_id = ?",
    [event.event_id]
  );
  const attended = Number(att[0].c);
  res.json({
    event,
    registered: event.registered_count,
    attended,
    attendance_rate: event.registered_count ? Math.round((attended / event.registered_count) * 1000) / 10 : 0,
    capacity_fill: event.capacity ? Math.round((event.registered_count / event.capacity) * 1000) / 10 : 0,
  });
});

api.get("/admin/users", requireAuth(["admin"]), async (req, res) => {
  const role = String(req.query.role || "");
  const rows = role
    ? await query<RowDataPacket[]>("SELECT user_id, name, email, role, department, year_of_study, phone, is_active, created_at FROM users WHERE role = ? ORDER BY created_at DESC", [role])
    : await query<RowDataPacket[]>("SELECT user_id, name, email, role, department, year_of_study, phone, is_active, created_at FROM users ORDER BY created_at DESC");
  res.json(rows.map((u) => ({ ...u, is_active: Boolean(u.is_active) })));
});

api.patch("/admin/users/:id", requireAuth(["admin"]), async (req, res) => {
  const rows = await query<(AuthUser & RowDataPacket)[]>("SELECT user_id, name, email, role, department, year_of_study, phone, is_active FROM users WHERE user_id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const body = req.body || {};
  const role = body.role ?? rows[0].role;
  if (!["student", "organizer", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  const is_active = body.is_active === undefined ? rows[0].is_active : body.is_active ? 1 : 0;
  const department = body.department === undefined ? rows[0].department : body.department;
  await execute("UPDATE users SET role = ?, is_active = ?, department = ? WHERE user_id = ?", [role, is_active, department, req.params.id]);
  const updated = await query<(AuthUser & RowDataPacket)[]>("SELECT user_id, name, email, role, department, year_of_study, phone, is_active FROM users WHERE user_id = ?", [req.params.id]);
  res.json(publicUser(updated[0]));
});

api.post("/admin/events/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  await execute("UPDATE events SET status = 'published' WHERE event_id = ?", [event.event_id]);
  await notify(event.organizer_id, `"${event.event_name}" has been approved and published.`, "event");
  res.json(await eventWithCounts(event.event_id));
});

api.post("/admin/events/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const event = await eventWithCounts(Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  const reason = req.body?.reason || "Does not meet campus event guidelines";
  await execute("UPDATE events SET status = 'rejected' WHERE event_id = ?", [event.event_id]);
  await notify(event.organizer_id, `"${event.event_name}" was rejected. Reason: ${reason}`, "event");
  res.json(await eventWithCounts(event.event_id));
});

api.get("/notifications", requireAuth(), async (req: AuthedRequest, res) => {
  const items = await query<RowDataPacket[]>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [req.user!.user_id]
  );
  const unread = await query<RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0",
    [req.user!.user_id]
  );
  res.json({ unread: Number(unread[0].c), items: items.map((i) => ({ ...i, is_read: Boolean(i.is_read) })) });
});

api.post("/notifications/:id/read", requireAuth(), async (req: AuthedRequest, res) => {
  await execute("UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?", [
    req.params.id,
    req.user!.user_id,
  ]);
  res.json({ message: "ok" });
});

api.post("/notifications/read-all", requireAuth(), async (req: AuthedRequest, res) => {
  await execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user!.user_id]);
  res.json({ message: "All notifications marked as read" });
});

function csv(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function shapeRegistration(row: RowDataPacket, includeUser = false, includeEvent = false) {
  const att = await query<RowDataPacket[]>("SELECT * FROM attendance WHERE registration_id = ?", [row.registration_id]);
  const payload: Record<string, unknown> = {
    registration_id: row.registration_id,
    user_id: row.user_id,
    event_id: row.event_id,
    qr_token: row.qr_token,
    registration_date: row.registration_date,
    status: row.status,
    attended: att.length > 0,
    checkin_time: att[0]?.checkin_time || null,
  };
  if (includeEvent) payload.event = await eventWithCounts(row.event_id);
  if (includeUser) {
    const users = await query<RowDataPacket[]>("SELECT user_id, name, email, department FROM users WHERE user_id = ?", [row.user_id]);
    payload.student = users[0] || { name: row.name, email: row.email, department: row.department, user_id: row.user_id };
  }
  return payload;
}

export function sendUpload(req: AuthedRequest, res: Response) {
  res.sendFile(path.join(uploadDir, "banners", path.basename(req.params.file)));
}
