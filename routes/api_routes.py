"""
Smart Parking System — REST API Routes
"""
from flask import Blueprint, jsonify, request
from services import parking_service
from services.camera_service import get_latest_plate

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/stats")
def stats():
    return jsonify(parking_service.get_stats())


@api_bp.route("/spaces")
def spaces():
    all_spaces = parking_service.get_all_spaces()
    stats = parking_service.get_stats()
    return jsonify({"spaces": all_spaces, **stats})


@api_bp.route("/spaces/<space_id>/release", methods=["POST"])
def release_space(space_id):
    result = parking_service.release_space(space_id)
    if result:
        return jsonify({"success": True, **result})
    return jsonify({"success": False, "error": "Space not found or already free"}), 404


@api_bp.route("/plates")
def plates():
    limit = request.args.get("limit", 20, type=int)
    return jsonify(parking_service.get_recent_plates(limit))


@api_bp.route("/plates/<int:plate_id>")
def plate_detail(plate_id):
    plate = parking_service.get_plate_by_id(plate_id)
    if plate:
        return jsonify(plate)
    return jsonify({"error": "Not found"}), 404


@api_bp.route("/latest_plate")
def latest_plate():
    return jsonify(get_latest_plate())


@api_bp.route("/activity")
def activity():
    limit = request.args.get("limit", 30, type=int)
    return jsonify(parking_service.get_activity_log(limit))


@api_bp.route("/session")
def session():
    info = parking_service.get_session_info()
    if info:
        return jsonify(info)
    return jsonify({"error": "No active session"}), 404
