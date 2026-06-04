"""
Smart Parking System — REST API Routes
"""
from flask import Blueprint, jsonify, request
from services import parking_service
from services.camera_service import get_latest_plate
from models import database as db

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
    plate = get_latest_plate()
    if plate and plate.get("text"):
        profile = db.fetchone("SELECT profile_type, owner_name, notes FROM vehicle_profiles WHERE plate_text = ?", (plate["text"],))
        if profile:
            plate["profile_type"] = profile["profile_type"]
            plate["owner_name"] = profile["owner_name"]
            plate["notes"] = profile["notes"]
        else:
            plate["profile_type"] = "normal"
            plate["owner_name"] = "Visitor"
            plate["notes"] = ""
    return jsonify(plate)


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


@api_bp.route("/analytics")
def analytics():
    return jsonify(parking_service.get_analytics_data())


@api_bp.route("/sandbox/entry", methods=["POST"])
def sandbox_entry():
    data = request.get_json() or {}
    plate_text = data.get("plate_text", "").strip().upper()
    state = data.get("state", "DL").strip().upper()

    if not plate_text:
        return jsonify({"success": False, "error": "License plate text is required"}), 400

    # Query profile details
    profile = db.fetchone("SELECT profile_type, owner_name, notes FROM vehicle_profiles WHERE plate_text = ?", (plate_text,))
    profile_type = profile["profile_type"] if profile else "normal"
    owner_name = profile["owner_name"] if profile else "Visitor"
    notes = profile["notes"] if profile else ""

    # Record detection
    parking_service.record_detection(plate_text, state, 0.95)
    
    # Assign space
    space_id = parking_service.assign_space(plate_text)
    if space_id:
        return jsonify({
            "success": True,
            "space_id": space_id,
            "plate_text": plate_text,
            "state": state,
            "profile_type": profile_type,
            "owner_name": owner_name,
            "notes": notes
        })
    else:
        return jsonify({"success": False, "error": "No parking spaces available"}), 400


@api_bp.route("/sandbox/exit", methods=["POST"])
def sandbox_exit():
    data = request.get_json() or {}
    space_id = data.get("space_id", "").strip()

    if not space_id:
        return jsonify({"success": False, "error": "Space ID is required"}), 400

    result = parking_service.release_space(space_id)
    if result:
        return jsonify({"success": True, **result})
    return jsonify({"success": False, "error": "Space not occupied or not found"}), 400


@api_bp.route("/billing/stats")
def billing_stats():
    return jsonify(parking_service.get_billing_stats())


