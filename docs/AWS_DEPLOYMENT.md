# AWS deployment

1. Create a billing alarm.
2. Security groups: `sg-web` (22 from your IP, 80 public), `sg-db` (3306 from `sg-web` only).
3. RDS MySQL, private, backups on.
4. Ubuntu EC2, Docker installed, IAM role for logs (and S3 if used).
5. Build and run:

```bash
docker build -t campusconnect -f backend/Dockerfile .
docker run -d -p 80:5000 --name campusconnect \
  -e DATABASE_HOST=YOUR_RDS_ENDPOINT \
  -e DATABASE_USER=... \
  -e DATABASE_PASSWORD=... \
  -e DATABASE_NAME=campusconnect \
  -e JWT_SECRET=long-random-string \
  -e SEED_DEMO_DATA=true \
  campusconnect
```

Open `http://EC2_PUBLIC_IP`. Health: `/api/health`.

Stop EC2 and RDS after the demo.
