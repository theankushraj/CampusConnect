# Results and key findings (fill after the demo)

Copy this section into your report **after** you have real measurements.

## Deployment

- URL:
- Region:
- EC2 type / OS:
- RDS class:
- Images in ECR: yes/no
- CloudWatch dashboard: yes/no

## Availability (test window)

- Window start/end:
- Planned minutes:
- Observed downtime minutes:
- Availability % = (planned − down) / planned × 100
- Compared with 99.5% target:

## Performance

| Users | Duration | Median | p95 | Errors | Notes |
| --- | --- | --- | --- | --- | --- |
| 10 |  |  |  |  |  |
| 50 |  |  |  |  |  |
| 100 |  |  |  |  |  |
| 200 |  |  |  |  |  |

Bottlenecks observed (CPU, DB connections, Gunicorn workers, network):

## Security controls verified

- [ ] Passwords stored as hashes
- [ ] Student cannot approve events or scan unrelated tickets
- [ ] Invalid QR rejected
- [ ] Duplicate check-in rejected
- [ ] Security group does not expose RDS publicly
- [ ] `.env` not committed

## Recovery

- Failure injected:
- Detection time:
- Restore time:
- TTR:
- RTO met? (30 min)

## Gaps and future work

Multi-college tenancy, payments, mobile app, certificates, CI/CD, Lambda components.
