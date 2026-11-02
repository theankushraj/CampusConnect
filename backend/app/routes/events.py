from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from marshmallow import Schema, ValidationError, fields, pre_load, validate
from sqlalchemy import or_

from ..extensions import db
from ..models import Event, Registration
from ..storage import save_banner
from ..utils import current_user, notify, role_required

events_bp = Blueprint("events", __name__)


def parse_dt(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)


class EventSchema(Schema):
    event_name = fields.Str(required=True, validate=validate.Length(min=3, max=200))
    description = fields.Str(required=True, validate=validate.Length(min=10))
    event_date = fields.DateTime(required=True)
    registration_deadline = fields.DateTime(allow_none=True, load_default=None)
    venue = fields.Str(required=True, validate=validate.Length(min=2, max=200))
    capacity = fields.Int(required=True, validate=validate.Range(min=1, max=10000))
    category = fields.Str(load_default="General")
    eligibility = fields.Str(load_default="Open to all students")

    @pre_load
    def normalize_dates(self, data, **_kwargs):
        if not isinstance(data, dict):
            return data
        for key in ("event_date", "registration_deadline"):
            if key in data and data[key]:
                data[key] = parse_dt(data[key]).isoformat()
            elif key in data and data[key] in ("", None):
                data[key] = None
        return data


def parse_event_payload():
    return EventSchema().load(request.get_json() or {})


@events_bp.get("")
@jwt_required(optional=True)
def list_events():
    user = current_user()
    query = Event.query
    status = request.args.get("status")
    category = request.args.get("category")
    search = request.args.get("q")
    mine = request.args.get("mine") == "true"

    if user and user.role == "admin":
        if status:
            query = query.filter_by(status=status)
    elif user and user.role == "organizer" and mine:
        query = query.filter_by(organizer_id=user.user_id)
        if status:
            query = query.filter_by(status=status)
    else:
        query = query.filter_by(status="published")

    if category:
        query = query.filter_by(category=category)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(Event.event_name.ilike(like), Event.venue.ilike(like), Event.description.ilike(like))
        )

    events = query.order_by(Event.event_date.asc()).all()
    return jsonify([event.to_dict() for event in events])


@events_bp.get("/<int:event_id>")
@jwt_required(optional=True)
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if event.status != "published":
        if not user or (
            user.role == "student"
            or (user.role == "organizer" and event.organizer_id != user.user_id)
        ):
            if not user or user.role != "admin":
                return jsonify({"error": "Event is not available"}), 404

    payload = event.to_dict()
    if user:
        registration = Registration.query.filter_by(
            user_id=user.user_id, event_id=event.event_id
        ).first()
        payload["my_registration"] = registration.to_dict() if registration else None
    return jsonify(payload)


@events_bp.post("")
@role_required("organizer", "admin")
def create_event():
    try:
        data = parse_event_payload()
    except ValidationError as err:
        return jsonify({"error": "Invalid input", "details": err.messages}), 400

    user = current_user()
    event = Event(organizer_id=user.user_id, status="pending", **data)
    db.session.add(event)
    db.session.commit()
    notify(
        user.user_id,
        f'"{event.event_name}" was submitted for administrator approval.',
        "event",
    )
    db.session.commit()
    return jsonify(event.to_dict()), 201


@events_bp.put("/<int:event_id>")
@role_required("organizer", "admin")
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role != "admin" and event.organizer_id != user.user_id:
        return jsonify({"error": "You can only edit your own events"}), 403

    try:
        data = parse_event_payload()
    except ValidationError as err:
        return jsonify({"error": "Invalid input", "details": err.messages}), 400

    for key, value in data.items():
        setattr(event, key, value)
    if event.status == "rejected":
        event.status = "pending"
    db.session.commit()
    return jsonify(event.to_dict())


@events_bp.delete("/<int:event_id>")
@role_required("organizer", "admin")
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role != "admin" and event.organizer_id != user.user_id:
        return jsonify({"error": "You can only delete your own events"}), 403
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event deleted"})


@events_bp.post("/<int:event_id>/banner")
@role_required("organizer", "admin")
def upload_banner(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role != "admin" and event.organizer_id != user.user_id:
        return jsonify({"error": "You can only update your own events"}), 403
    if "file" not in request.files:
        return jsonify({"error": "Attach an image file"}), 400
    try:
        event.banner_url = save_banner(request.files["file"])
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    db.session.commit()
    return jsonify(event.to_dict())


@events_bp.get("/<int:event_id>/participants")
@role_required("organizer", "admin")
def participants(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role != "admin" and event.organizer_id != user.user_id:
        return jsonify({"error": "You can only view participants for your events"}), 403
    rows = Registration.query.filter_by(event_id=event_id).order_by(Registration.registration_date.asc()).all()
    return jsonify([row.to_dict(include_user=True) for row in rows])


@events_bp.get("/categories")
def categories():
    return jsonify(
        [
            "Technical",
            "Cultural",
            "Sports",
            "Workshop",
            "Seminar",
            "Hackathon",
            "Social",
            "General",
        ]
    )
