import fs from "fs";
import path from "path";
import mysql, { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { DatabaseSync } from "node:sqlite";

type Driver = "mysql" | "sqlite";

let driver: Driver = "mysql";
let pool: Pool;
let sqlite: DatabaseSync;

export async function connectDatabase(): Promise<void> {
  if (process.env.USE_SQLITE !== "false") {
    openSqlite();
    return;
  }
  try {
    pool = mysql.createPool({
      host: process.env.DATABASE_HOST || "127.0.0.1",
      port: Number(process.env.DATABASE_PORT || 3306),
      user: process.env.DATABASE_USER || "campus",
      password: process.env.DATABASE_PASSWORD || "campus",
      database: process.env.DATABASE_NAME || "campusconnect",
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 2000,
    });
    await pool.query("SELECT 1");
    driver = "mysql";
    console.log("Using MySQL");
  } catch {
    console.warn("MySQL not available, using SQLite instead.");
    if (pool) await pool.end().catch(() => undefined);
    openSqlite();
  }
}

function openSqlite() {
  driver = "sqlite";
  const file = process.env.SQLITE_PATH || path.join(process.cwd(), "campusconnect.db");
  sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA foreign_keys = ON");
  console.log("Using SQLite at", file);
}

export async function query<T extends RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  if (driver === "sqlite") {
    const stmt = sqlite.prepare(sql);
    return stmt.all(...(params as never[])) as T;
  }
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = []): Promise<{ insertId: number }> {
  if (driver === "sqlite") {
    const info = sqlite.prepare(sql).run(...(params as never[]));
    return { insertId: Number(info.lastInsertRowid) };
  }
  const [result] = await pool.execute<ResultSetHeader>(sql, params as never);
  return { insertId: Number(result.insertId) };
}

export async function initSchema(): Promise<void> {
  if (driver === "sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        department TEXT,
        year_of_study TEXT,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        description TEXT,
        organizer_id INTEGER NOT NULL,
        event_date TEXT NOT NULL,
        registration_deadline TEXT,
        venue TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 50,
        banner_url TEXT,
        category TEXT DEFAULT 'General',
        eligibility TEXT DEFAULT 'Open to all students',
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organizer_id) REFERENCES users(user_id)
      );
      CREATE TABLE IF NOT EXISTS registrations (
        registration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        qr_token TEXT NOT NULL UNIQUE,
        registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'confirmed',
        UNIQUE (user_id, event_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS attendance (
        attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
        registration_id INTEGER NOT NULL UNIQUE,
        checkin_time TEXT DEFAULT CURRENT_TIMESTAMP,
        marked_by INTEGER NOT NULL,
        attendance_status TEXT DEFAULT 'present',
        FOREIGN KEY (registration_id) REFERENCES registrations(registration_id) ON DELETE CASCADE,
        FOREIGN KEY (marked_by) REFERENCES users(user_id)
      );
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        notification_type TEXT DEFAULT 'info',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      );
    `);
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      department VARCHAR(120),
      year_of_study VARCHAR(20),
      phone VARCHAR(20),
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS events (
      event_id INT AUTO_INCREMENT PRIMARY KEY,
      event_name VARCHAR(200) NOT NULL,
      description TEXT,
      organizer_id INT NOT NULL,
      event_date DATETIME NOT NULL,
      registration_deadline DATETIME,
      venue VARCHAR(200) NOT NULL,
      capacity INT NOT NULL DEFAULT 50,
      banner_url VARCHAR(500),
      category VARCHAR(80) DEFAULT 'General',
      eligibility VARCHAR(255) DEFAULT 'Open to all students',
      status VARCHAR(20) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_id) REFERENCES users(user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS registrations (
      registration_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      qr_token VARCHAR(64) NOT NULL UNIQUE,
      registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'confirmed',
      UNIQUE KEY uq_user_event (user_id, event_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      attendance_id INT AUTO_INCREMENT PRIMARY KEY,
      registration_id INT NOT NULL UNIQUE,
      checkin_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      marked_by INT NOT NULL,
      attendance_status VARCHAR(20) DEFAULT 'present',
      FOREIGN KEY (registration_id) REFERENCES registrations(registration_id) ON DELETE CASCADE,
      FOREIGN KEY (marked_by) REFERENCES users(user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      notification_type VARCHAR(40) DEFAULT 'info',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read TINYINT(1) DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);
}

export function resolveFrontendDir(): string | null {
  const candidates = [
    process.env.FRONTEND_DIR,
    path.resolve(process.cwd(), "../frontend"),
    path.resolve(process.cwd(), "frontend"),
    path.resolve(__dirname, "../../frontend"),
    path.resolve(__dirname, "../frontend"),
  ].filter((value): value is string => Boolean(value));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}
