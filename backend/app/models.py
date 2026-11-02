from datetime import datetime

from .extensions import db


class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student")
    department = db.Column(db.String(120))
    year_of_study = db.Column(db.String(20))
    phone = db.Column(db.String(20))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    events = db.relationship("Event", backref="organizer", lazy=True)
    registrations = db.relationship("Registration", backref="student", lazy=True)
    notifications = db.relationship("Notification", backref="user", lazy=True)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "department": self.department,
            "year_of_study": self.year_of_study,
            "phone": self.phone,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Event(db.Model):
    __tablename__ = "events"

    event_id = db.Column(db.Integer, primary_key=True)
    event_name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    organizer_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    event_date = db.Column(db.DateTime, nullable=False)
    registration_deadline = db.Column(db.DateTime)
    venue = db.Column(db.String(200), nullable=False)
    capacity = db.Column(db.Integer, nullable=False, default=50)
    banner_url = db.Column(db.String(500))
    category = db.Column(db.String(80), default="General")
    eligibility = db.Column(db.String(255), default="Open to all students")
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    registrations = db.relationship(
        "Registration", backref="event", lazy=True, cascade="all, delete-orphan"
    )

    def registered_count(self):
        return Registration.query.filter(
            Registration.event_id == self.event_id,
            Registration.status.in_(["confirmed", "attended"]),
        ).count()

    def to_dict(self, include_counts=True):
        payload = {
            "event_id": self.event_id,
            "event_name": self.event_name,
            "description": self.description,
            "organizer_id": self.organizer_id,
            "organizer_name": self.organizer.name if self.organizer else None,
            "event_date": self.event_date.isoformat() if self.event_date else None,
            "registration_deadline": (
                self.registration_deadline.isoformat() if self.registration_deadline else None
            ),
            "venue": self.venue,
            "capacity": self.capacity,
            "banner_url": self.banner_url,
            "category": self.category,
            "eligibility": self.eligibility,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_counts:
            registered = self.registered_count()
            payload["registered_count"] = registered
            payload["seats_remaining"] = max(self.capacity - registered, 0)
        return payload


class Registration(db.Model):
    __tablename__ = "registrations"
    __table_args__ = (
        db.UniqueConstraint("user_id", "event_id", name="uq_user_event"),
    )

    registration_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey("events.event_id"), nullable=False)
    qr_token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    registration_date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="confirmed")

    attendance = db.relationship(
        "Attendance", backref="registration", uselist=False, cascade="all, delete-orphan"
    )

    def to_dict(self, include_event=False, include_user=False):
        payload = {
            "registration_id": self.registration_id,
            "user_id": self.user_id,
            "event_id": self.event_id,
            "qr_token": self.qr_token,
            "registration_date": (
                self.registration_date.isoformat() if self.registration_date else None
            ),
            "status": self.status,
            "attended": self.attendance is not None,
            "checkin_time": (
                self.attendance.checkin_time.isoformat()
                if self.attendance and self.attendance.checkin_time
                else None
            ),
        }
        if include_event and self.event:
            payload["event"] = self.event.to_dict()
        if include_user and self.student:
            payload["student"] = {
                "user_id": self.student.user_id,
                "name": self.student.name,
                "email": self.student.email,
                "department": self.student.department,
            }
        return payload


class Attendance(db.Model):
    __tablename__ = "attendance"

    attendance_id = db.Column(db.Integer, primary_key=True)
    registration_id = db.Column(
        db.Integer, db.ForeignKey("registrations.registration_id"), unique=True, nullable=False
    )
    checkin_time = db.Column(db.DateTime, default=datetime.utcnow)
    marked_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    attendance_status = db.Column(db.String(20), default="present")

    marker = db.relationship("User", foreign_keys=[marked_by])

    def to_dict(self):
        return {
            "attendance_id": self.attendance_id,
            "registration_id": self.registration_id,
            "checkin_time": self.checkin_time.isoformat() if self.checkin_time else None,
            "marked_by": self.marked_by,
            "attendance_status": self.attendance_status,
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    notification_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    message = db.Column(db.Text, nullable=False)
    notification_type = db.Column(db.String(40), default="info")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            "notification_id": self.notification_id,
            "user_id": self.user_id,
            "message": self.message,
            "notification_type": self.notification_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_read": self.is_read,
        }
