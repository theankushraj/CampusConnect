# CampusConnect

Cloud-based college event management and registration system. Students discover campus events, register and receive QR tickets. Organizers publish events and scan attendance. Administrators approve events and monitor participation.

**Stack:** React.js · Flask · MySQL · Docker · AWS (EC2, RDS, S3, ECR, CloudWatch, IAM, VPC)

## What is implemented

| Module | Behaviour |
| --- | --- |
| Authentication | Register/login with bcrypt hashes, JWT sessions, role-based access |
| Event management | Create, edit, banners, capacity, deadlines, admin approve/reject |
| Registration | Capacity checks, unique `(user, event)` constraint |
| QR ticketing | Unpredictable token + server-generated QR image |
| Attendance | Scan or paste token, reject duplicates |
| Analytics | Role-specific dashboards and event fill/attendance rates |
| Notifications | Registration, approval and check-in messages |

## Demo accounts (seeded)

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@campusconnect.edu` | `Campus@123` |
| Organizer | `organizer@campusconnect.edu` | `Campus@123` |
| Administrator | `admin@campusconnect.edu` | `Admin@123` |

## Run with Docker (recommended)

```bash
docker compose up --build
```

- App: http://localhost:3000
- API: http://localhost:5000/api/health

The Compose file starts MySQL, a Gunicorn Flask API and an nginx frontend. Application tables are created on first boot and demo data is seeded once.

## Local development (without Docker frontend)

1. Start MySQL (Compose `mysql` service is enough): `docker compose up mysql`
2. Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=mysql+pymysql://campus:campus@127.0.0.1:3306/campusconnect
python wsgi.py
# Local API listens on port 5001 (macOS often occupies 5000).
# Docker Compose still publishes the API on port 5000.
```

If MySQL is not running, SQLite works for a local demo:

```bash
export DATABASE_URL=sqlite:///campusconnect.db
python wsgi.py
```

3. Frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:5000`.

## Tests and load measurement

```bash
cd backend
pytest
locust -f locustfile.py --host http://localhost:5000
```

Record **your** Locust/JMeter numbers in the report. Do not copy example SLA figures from the project plan.

## Academic documents

- [Architecture and request flow](docs/ARCHITECTURE.md)
- [AWS deployment and evidence checklist](docs/AWS_DEPLOYMENT.md)
- [SLA, monitoring and performance testing](docs/TESTING_AND_SLA.md)
- [Results section template](docs/RESULTS_TEMPLATE.md)

## Security notes

Passwords are hashed. QR tokens are validated only on the server. SQL uses SQLAlchemy parameters. Uploads are type-checked. Secrets belong in environment variables, not in git.
