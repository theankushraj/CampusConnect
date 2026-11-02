from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Event, User
from ..utils import notify, role_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/users")
@role_required("admin")
def list_users():
    role = request.args.get("role")
    query = User.query
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.created_at.desc()).all()
    return jsonify([user.to_dict() for user in users])


@admin_bp.patch("/users/<int:user_id>")
@role_required("admin")
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    payload = request.get_json() or {}
    if "role" in payload:
        if payload["role"] not in {"student", "organizer", "admin"}:
            return jsonify({"error": "Invalid role"}), 400
        user.role = payload["role"]
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    if "department" in payload:
        user.department = payload["department"]
    db.session.commit()
    return jsonify(user.to_dict())


@admin_bp.post("/events/<int:event_id>/approve")
@role_required("admin")
def approve_event(event_id):
    event = Event.query.get_or_404(event_id)
    event.status = "published"
    notify(
        event.organizer_id,
        f'"{event.event_name}" has been approved and published.',
        "event",
    )
    db.session.commit()
    return jsonify(event.to_dict())


@admin_bp.post("/events/<int:event_id>/reject")
@role_required("admin")
def reject_event(event_id):
    event = Event.query.get_or_404(event_id)
    reason = (request.get_json() or {}).get("reason", "Does not meet campus event guidelines")
    event.status = "rejected"
    notify(
        event.organizer_id,
        f'"{event.event_name}" was rejected. Reason: {reason}',
        "event",
    )
    db.session.commit()
    return jsonify(event.to_dict())


@admin_bp.get("/settings")
@role_required("admin")
def settings():
    return jsonify(
        {
            "app_name": "CampusConnect",
            "roles": ["student", "organizer", "admin"],
            "event_statuses": ["pending", "published", "rejected", "closed"],
        }
    )
