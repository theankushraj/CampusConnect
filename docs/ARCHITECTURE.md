# Architecture

Browser (HTML/CSS/JS) → Express TypeScript API → MySQL (local Docker or Amazon RDS).

Roles: student, organizer, administrator.

Unique QR tokens are created at registration and validated on the server at check-in. Duplicate attendance is rejected.
