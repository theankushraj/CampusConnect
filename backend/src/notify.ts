import { execute } from "./db";

export async function notify(userId: number, message: string, type = "info"): Promise<void> {
  await execute(
    "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, ?)",
    [userId, message, type]
  );
}
