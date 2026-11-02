import os
import uuid

from flask import current_app, send_from_directory
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def save_banner(file_storage):
    if not file_storage or file_storage.filename == "":
        raise ValueError("No file provided")
    if not allowed_file(file_storage.filename):
        raise ValueError("Unsupported image type")

    filename = secure_filename(file_storage.filename)
    extension = filename.rsplit(".", 1)[1].lower()
    object_name = f"banners/{uuid.uuid4().hex}.{extension}"

    if current_app.config["USE_S3"]:
        import boto3

        bucket = current_app.config["AWS_S3_BUCKET"]
        client = boto3.client("s3", region_name=current_app.config["AWS_REGION"])
        client.upload_fileobj(
            file_storage,
            bucket,
            object_name,
            ExtraArgs={"ContentType": file_storage.mimetype or "application/octet-stream"},
        )
        return f"s3://{bucket}/{object_name}"

    disk_path = os.path.join(current_app.config["UPLOAD_DIR"], object_name)
    os.makedirs(os.path.dirname(disk_path), exist_ok=True)
    file_storage.save(disk_path)
    return f"/api/uploads/{object_name}"


def serve_upload(relative_path):
    return send_from_directory(current_app.config["UPLOAD_DIR"], relative_path)
