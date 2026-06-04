"""
Smart Parking System — Main Page Routes
"""
from flask import Blueprint, render_template

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/detect")
def detect():
    return render_template("detect.html")


@main_bp.route("/parking")
def parking():
    return render_template("parking.html")


@main_bp.route("/admin")
def admin():
    return render_template("admin.html")
