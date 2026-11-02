from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ..extensions import db
from ..models import Attendance, Event, Registration, User
from ..utils import current_user, role_required

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.get("/overview")
@jwt_required()
def overview():
    user = current_user()
    if user.role == "admin":
        return jsonify(_admin_overview())
    if user.role == "organizer":
        return jsonify(_organizer_overview(user.user_id))
    return jsonify(_student_overview(user.user_id))


@analytics_bp.get("/events/<int:event_id>")
@role_required("organizer", "admin")
def event_analytics(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role == "organizer" and event.organizer_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403

    registered = event.registered_count()
    attended = (
        Attendance.query.join(Registration)
        .filter(Registration.event_id == event_id)
        .count()
    )
    rate = round((attended / registered) * 100, 1) if registered else 0
    return jsonify(
        {
            "event": event.to_dict(),
            "registered": registered,
            "attended": attended,
            "attendance_rate": rate,
            "capacity_fill": round((registered / event.capacity) * 100, 1) if event.capacity else 0,
        }
    )


def _admin_overview():
    total_users = User.query.count()
    students = User.query.filter_by(role="student").count()
    organizers = User.query.filter_by(role="organizer").count()
    events = Event.query.count()
    published = Event.query.filter_by(status="published").count()
    pending = Event.query.filter_by(status="pending").count()
    registrations = Registration.query.count()
    attendance = Attendance.query.count()
    by_category = (
        db.session.query(Event.category, func.count(Event.event_id))
        .group_by(Event.category)
        .all()
    )
    recent_events = (
        Event.query.order_by(Event.created_at.desc()).limit(6).all()
    )
    return {
        "totals": {
            "users": total_users,
            "students": students,
            "organizers": organizers,
            "events": events,
            "published_events": published,
            "pending_events": pending,
            "registrations": registrations,
            "attendance": attendance,
        },
        "by_category": [{"category": c or "General", "count": n} for c, n in by_category],
        "recent_events": [event.to_dict() for event in recent_events],
    }


def _organizer_overview(organizer_id):
    events = Event.query.filter_by(organizer_id=organizer_id).all()
    event_ids = [event.event_id for event in events]
    registrations = (
        Registration.query.filter(Registration.event_id.in_(event_ids)).count() if event_ids else 0
    )
    attendance = (
        Attendance.query.join(Registration)
        .filter(Registration.event_id.in_(event_ids))
        .count()
        if event_ids
        else 0
    )
    return {
        "totals": {
            "events": len(events),
            "published_events": sum(1 for event in events if event.status == "published"),
            "pending_events": sum(1 for event in events if event.status == "pending"),
            "registrations": registrations,
            "attendance": attendance,
        },
        "events": [event.to_dict() for event in events],
    }


def _student_overview(user_id):
    registrations = Registration.query.filter_by(user_id=user_id).all()
    attended = sum(1 for row in registrations if row.attendance)
    upcoming = [
        row.to_dict(include_event=True)
        for row in registrations
        if row.event and row.event.status == "published"
    ]
    return {
        "totals": {
            "registrations": len(registrations),
            "attended": attended,
        },
        "registrations": upcoming,
    }
