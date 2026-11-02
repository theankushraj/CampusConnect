# CampusConnect

College event management: publish events, register with QR tickets, scan attendance.

**Backend:** Node.js + TypeScript (Express, JWT, bcrypt, MySQL)  
**Frontend:** HTML, CSS, and JavaScript

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@campusconnect.edu` | `Campus@123` |
| Organizer | `organizer@campusconnect.edu` | `Campus@123` |
| Admin | `admin@campusconnect.edu` | `Admin@123` |

## Run locally

1. Start MySQL (Docker):

```bash
docker compose up mysql -d
```

2. API + static frontend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Open **http://localhost:3000**

macOS often occupies port 5000 (AirPlay), so the API uses **5001**.

## Run everything with Docker

```bash
docker compose up --build
```

App: **http://localhost:3000**

## Deploy on AWS

See `docs/AWS_DEPLOYMENT.md`. Short version: RDS MySQL + one EC2 VM running the `app` container, optional S3 for banners, CloudWatch for logs.

## Project layout

```
backend/src/     TypeScript API
frontend/        HTML, CSS, JS
mysql/           database init
docs/            architecture and AWS notes
```
