import { RowDataPacket } from "mysql2";
import { query } from "./db";

export async function eventWithCounts(eventId: number) {
  const rows = await query<RowDataPacket[]>(
    `SELECT e.*, u.name AS organizer_name,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id AND r.status IN ('confirmed','attended')) AS registered_count
     FROM events e JOIN users u ON u.user_id = e.organizer_id
     WHERE e.event_id = ?`,
    [eventId]
  );
  return rows[0] ? shapeEvent(rows[0]) : null;
}

export function shapeEvent(row: RowDataPacket) {
  const registered = Number(row.registered_count || 0);
  return {
    event_id: row.event_id,
    event_name: row.event_name,
    description: row.description,
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    event_date: row.event_date,
    registration_deadline: row.registration_deadline,
    venue: row.venue,
    capacity: row.capacity,
    banner_url: row.banner_url,
    category: row.category,
    eligibility: row.eligibility,
    status: row.status,
    created_at: row.created_at,
    registered_count: registered,
    seats_remaining: Math.max(row.capacity - registered, 0),
  };
}

export async function listEvents(opts: {
  role?: string;
  userId?: number;
  status?: string;
  category?: string;
  q?: string;
  mine?: boolean;
}) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.role === "admin") {
    if (opts.status) {
      where.push("e.status = ?");
      params.push(opts.status);
    }
  } else if (opts.role === "organizer" && opts.mine) {
    where.push("e.organizer_id = ?");
    params.push(opts.userId);
    if (opts.status) {
      where.push("e.status = ?");
      params.push(opts.status);
    }
  } else {
    where.push("e.status = 'published'");
  }

  if (opts.category) {
    where.push("e.category = ?");
    params.push(opts.category);
  }
  if (opts.q) {
    where.push("(e.event_name LIKE ? OR e.venue LIKE ? OR e.description LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }

  const sql = `SELECT e.*, u.name AS organizer_name,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id AND r.status IN ('confirmed','attended')) AS registered_count
    FROM events e JOIN users u ON u.user_id = e.organizer_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY e.event_date ASC`;
  const rows = await query<RowDataPacket[]>(sql, params);
  return rows.map(shapeEvent);
}
