from flask import Blueprint, jsonify, send_from_directory, current_app
import os

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    return jsonify({"status": "ok", "service": "campusconnect-api"})


@health_bp.get("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(current_app.config["UPLOAD_DIR"], filename)
