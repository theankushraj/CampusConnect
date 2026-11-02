# AWS deployment guide

Keep resources small, stop them after the demo, and set a billing alarm first.

## Services used

| Service | Role |
| --- | --- |
| EC2 | Ubuntu VM running Docker |
| RDS | Managed MySQL |
| S3 | Private bucket for event banners |
| ECR | Versioned Docker images |
| CloudWatch | CPU, logs, alarms |
| IAM | Least-privilege instance role |
| VPC | Public subnet for EC2, private subnet for RDS if possible |

## Suggested sequence

1. Create a VPC (or default VPC), security groups:
   - `sg-web`: inbound 22 (your IP), 80, 443
   - `sg-db`: inbound 3306 from `sg-web` only
2. Create RDS MySQL (`db.t3.micro` or equivalent), 15–20 GB, backups enabled.
3. Create a private S3 bucket. Block public access. The API reads/writes with an IAM role.
4. Create an ECR repository. Build and push:

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t campusconnect-backend ./backend
docker tag campusconnect-backend:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/campusconnect-backend:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/campusconnect-backend:latest
```

Repeat for `frontend`.

5. Launch Ubuntu EC2. Attach an IAM role that can pull ECR, write CloudWatch logs and access the S3 bucket (not AdministratorAccess).
6. Install Docker, log in to ECR, pull images, run containers with environment variables:

```bash
export DATABASE_URL=mysql+pymysql://USER:PASSWORD@RDS_ENDPOINT:3306/campusconnect
export USE_S3=true
export AWS_S3_BUCKET=your-bucket
export AWS_REGION=ap-south-1
export FRONTEND_URL=http://EC2_PUBLIC_DNS
export FLASK_ENV=production
export SEED_DEMO_DATA=true
```

7. Point CloudWatch agent or Docker `awslogs` driver at a log group `/campusconnect/api`.
8. Alarm: CPU > 70% for 5 minutes; alarm: no healthy HTTP 200 on `/api/health`.

## Evidence to screenshot

- Home, login, student events, organizer create form, QR ticket, scanner success
- `docker ps` on EC2
- ECR image list
- EC2 instance, RDS, S3 bucket (private)
- CloudWatch dashboard and at least one alarm
- Public URL loading the app
- Locust/JMeter output from **your** run
- Recovery exercise timestamps

## Cost controls

Use burstable instances, stop EC2 when idle, delete unused images and snapshots, develop locally with Compose first. Verify current regional pricing and free-tier limits before you launch anything.
