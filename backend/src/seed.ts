import bcrypt from "bcryptjs";
import { execute, query } from "./db";
import { RowDataPacket } from "mysql2";
import crypto from "crypto";

export async function seedDemoData(): Promise<void> {
  const existing = await query<RowDataPacket[]>(
    "SELECT user_id FROM users WHERE email = ?",
    ["admin@campusconnect.edu"]
  );
  if (existing.length) return;

  const hash = (password: string) => bcrypt.hashSync(password, 10);

  await execute(
    `INSERT INTO users (name, email, password_hash, role, department, year_of_study) VALUES
     (?, ?, ?, 'admin', 'Administration', NULL),
     (?, ?, ?, 'organizer', 'Computer Science', NULL),
     (?, ?, ?, 'organizer', 'Student Affairs', NULL),
     (?, ?, ?, 'student', 'Computer Science', 'III'),
     (?, ?, ?, 'student', 'Electronics', 'III'),
     (?, ?, ?, 'student', 'Mechanical', 'II')`,
    [
      "Campus Admin",
      "admin@campusconnect.edu",
      hash("Admin@123"),
      "Priya Sharma",
      "organizer@campusconnect.edu",
      hash("Campus@123"),
      "Rahul Mehta",
      "cultural@campusconnect.edu",
      hash("Campus@123"),
      "Ananya Iyer",
      "student@campusconnect.edu",
      hash("Campus@123"),
      "Arjun Patel",
      "arjun@campusconnect.edu",
      hash("Campus@123"),
      "Meera Nair",
      "meera@campusconnect.edu",
      hash("Campus@123"),
    ]
  );

  const users = await query<RowDataPacket[]>("SELECT user_id, email FROM users");
  const id = (email: string) => users.find((u) => u.email === email)!.user_id as number;
  const org = id("organizer@campusconnect.edu");
  const org2 = id("cultural@campusconnect.edu");
  const student = id("student@campusconnect.edu");
  const student2 = id("arjun@campusconnect.edu");
  const student3 = id("meera@campusconnect.edu");

  const now = new Date();
  const plus = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();

  await execute(
    `INSERT INTO events (event_name, description, organizer_id, event_date, registration_deadline, venue, capacity, category, eligibility, status) VALUES
     (?, ?, ?, ?, ?, ?, 80, 'Hackathon', 'UG and PG students from all departments', 'published'),
     (?, ?, ?, ?, ?, ?, 120, 'Seminar', 'Open to all students', 'published'),
     (?, ?, ?, ?, ?, ?, 200, 'Sports', 'Department team members and spectators', 'published'),
     (?, ?, ?, ?, ?, ?, 150, 'Cultural', 'Open to all students and faculty', 'pending'),
     (?, ?, ?, ?, ?, ?, 40, 'Workshop', 'CS / IT / ECE students', 'published')`,
    [
      "Cloud Native Hackathon",
      "A 24-hour campus hackathon focused on cloud-native applications, containers and AWS services.",
      org,
      plus(12),
      plus(10),
      "Innovation Lab, Block C",
      "Guest Lecture: Careers in Cloud Computing",
      "Industry practitioners discuss IAM, managed databases, observability and campus cloud projects.",
      org,
      plus(5),
      plus(4),
      "Seminar Hall 2",
      "Inter-Department Cricket Finals",
      "Season-ending cricket final with live scoring, student commentary and food stalls.",
      org2,
      plus(8),
      plus(6),
      "Main Sports Ground",
      "Classical Night",
      "An evening of music and dance performances organized by the cultural committee.",
      org2,
      plus(18),
      plus(15),
      "Open Air Theatre",
      "Docker & Kubernetes Workshop",
      "Hands-on lab covering Dockerfiles, Compose, image registries and a simple Kubernetes demo.",
      org,
      plus(3),
      plus(2),
      "CS Lab 1",
    ]
  );

  const events = await query<RowDataPacket[]>("SELECT event_id, event_name FROM events");
  const eventId = (name: string) => events.find((e) => e.event_name === name)!.event_id as number;

  const register = async (userId: number, evId: number) => {
    await execute(
      "INSERT INTO registrations (user_id, event_id, qr_token, status) VALUES (?, ?, ?, 'confirmed')",
      [userId, evId, crypto.randomBytes(24).toString("base64url")]
    );
  };

  await register(student, eventId("Guest Lecture: Careers in Cloud Computing"));
  await register(student, eventId("Docker & Kubernetes Workshop"));
  await register(student2, eventId("Cloud Native Hackathon"));
  await register(student2, eventId("Guest Lecture: Careers in Cloud Computing"));
  await register(student3, eventId("Inter-Department Cricket Finals"));

  await execute(
    "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, 'registration')",
    [student, 'You are registered for "Guest Lecture: Careers in Cloud Computing". Your ticket is ready.']
  );
}
