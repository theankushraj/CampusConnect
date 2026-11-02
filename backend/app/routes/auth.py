from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required
from marshmallow import Schema, ValidationError, fields, validate

from ..extensions import bcrypt, db
from ..models import User
from ..utils import current_user

auth_bp = Blueprint("auth", __name__)


class RegisterSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=72))
    role = fields.Str(load_default="student", validate=validate.OneOf(["student", "organizer"]))
    department = fields.Str(load_default="")
    year_of_study = fields.Str(load_default="")
    phone = fields.Str(load_default="")


class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)


@auth_bp.post("/register")
def register():
    try:
        data = RegisterSchema().load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": "Invalid input", "details": err.messages}), 400

    if User.query.filter_by(email=data["email"].lower()).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    user = User(
        name=data["name"].strip(),
        email=data["email"].lower(),
        password_hash=bcrypt.generate_password_hash(data["password"]).decode("utf-8"),
        role=data["role"],
        department=data.get("department") or None,
        year_of_study=data.get("year_of_study") or None,
        phone=data.get("phone") or None,
    )
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.user_id), additional_claims={"role": user.role})
    return jsonify({"access_token": token, "user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
    try:
        data = LoginSchema().load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": "Invalid input", "details": err.messages}), 400

    user = User.query.filter_by(email=data["email"].lower()).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, data["password"]):
        return jsonify({"error": "Incorrect email or password"}), 401
    if not user.is_active:
        return jsonify({"error": "This account has been deactivated"}), 403

    token = create_access_token(identity=str(user.user_id), additional_claims={"role": user.role})
    return jsonify({"access_token": token, "user": user.to_dict()})


@auth_bp.get("/me")
@jwt_required()
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict())


@auth_bp.post("/change-password")
@jwt_required()
def change_password():
    payload = request.get_json() or {}
    current = payload.get("current_password")
    new_password = payload.get("new_password")
    if not current or not new_password or len(new_password) < 8:
        return jsonify({"error": "Provide current password and a new password of at least 8 characters"}), 400

    user = current_user()
    if not bcrypt.check_password_hash(user.password_hash, current):
        return jsonify({"error": "Current password is incorrect"}), 400

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    db.session.commit()
    return jsonify({"message": "Password updated"})
