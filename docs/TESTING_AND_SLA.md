# Testing, SLA targets and recovery

These are **academic engineering targets**, not AWS service SLAs.

| Metric | Target |
| --- | --- |
| Availability in the test window | 99.5% |
| API response time | < 2 s for 95% of requests |
| Error rate | < 1% |
| RTO | 30 minutes |
| RPO | 15 minutes (RDS automated backup / snapshot interval you configure) |
| TTR | < 30 minutes in the recovery drill |

## Functional tests

```bash
cd backend && pytest
```

Covered: health, register/login, capacity limit, duplicate registration, QR check-in and duplicate attendance rejection.

## Load tests (Locust)

```bash
cd backend
locust -f locustfile.py --host http://localhost:5000
```

Suggested user counts from the project plan: 10, 50, 100, 200. Exercise login (already in `on_start`), event listing, registrations and analytics.

Record: duration, users, RPS, median/p95/p99 latency, error %. **Replace** any example numbers in the report with these measurements.

## Recovery drill (example procedure)

1. Note time T0 and stop the backend container: `docker stop campusconnect-backend-1`
2. Confirm CloudWatch/health check failure (T_detect).
3. Restart: `docker start campusconnect-backend-1` (T_restore).
4. TTR = T_restore − T0. Compare with the 30-minute RTO.

If you use RDS snapshots, restore a copy in a drill (expect minutes, not seconds) and treat that elapsed time as an RPO/RTO data point.
