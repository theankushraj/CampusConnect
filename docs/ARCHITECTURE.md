# CampusConnect architecture

## Request flow

```
Browser (React)
    → nginx / Vite
    → Flask API (Gunicorn, Docker)
    → Amazon RDS MySQL  (or local MySQL in Compose)
    → Amazon S3         (optional; local disk if USE_S3=false)
    → CloudWatch logs   (when deployed on EC2)
```

For the first deployment, a **single EC2 instance** runs Docker. RDS holds relational data. S3 stores banners. An Application Load Balancer is optional.

## Logical layers

1. **Presentation** — student, organizer and administrator dashboards in React.
2. **Application** — Flask blueprints for auth, events, registrations, attendance, analytics, admin and notifications.
3. **Data** — MySQL tables `users`, `events`, `registrations`, `attendance`, `notifications`.
4. **Infrastructure** — EC2 VM, Docker containers, VPC security groups, IAM roles.

## Data model

- One student registers for many events; one event has many registrations.
- Unique `(user_id, event_id)` prevents double registration.
- One registration has at most one attendance row.
- `qr_token` is unique and unguessable (`secrets.token_urlsafe(32)`).

## VM versus container (for the report)

A virtual machine (EC2) virtualizes hardware and runs a guest OS (Ubuntu). A container packages the app and its libraries while sharing the host kernel. CampusConnect uses **both**: EC2 for the virtual machine, Docker for the Flask and nginx processes.

## Scalability path

1. Vertical: larger EC2 instance type.
2. Horizontal: second EC2 + load balancer, shared RDS and S3.
3. Later: ECS/Fargate or Lambda for selected APIs.
