"""
Smart Parking System — Parking Space Management Service
CRUD operations for spaces, assignment, release, and statistics.
"""
import datetime
from models import database as db


def get_all_spaces():
    """Get all parking spaces grouped by zone."""
    rows = db.fetchall(
        "SELECT space_id, zone, floor, is_occupied, plate_text, entry_time FROM parking_spaces ORDER BY zone, space_id"
    )
    return [dict(r) for r in rows]


def get_spaces_by_zone():
    """Get spaces organized by zone."""
    spaces = get_all_spaces()
    zones = {}
    for s in spaces:
        zone = s["zone"]
        if zone not in zones:
            zones[zone] = []
        zones[zone].append(s)
    return zones


def get_stats():
    """Get overall parking statistics."""
    total = db.fetchone("SELECT COUNT(*) as c FROM parking_spaces")["c"]
    occupied = db.fetchone("SELECT COUNT(*) as c FROM parking_spaces WHERE is_occupied = 1")["c"]
    free = total - occupied

    today = datetime.date.today().isoformat()
    plates_today = db.fetchone(
        "SELECT COUNT(*) as c FROM detected_plates WHERE timestamp LIKE ?",
        (f"{today}%",)
    )["c"]

    return {
        "total": total,
        "occupied": occupied,
        "free": free,
        "occupancy_pct": round(occupied / total * 100, 1) if total > 0 else 0,
        "plates_today": plates_today,
    }


def get_free_spaces(limit=5):
    """Get a list of free space IDs."""
    rows = db.fetchall(
        "SELECT space_id, zone FROM parking_spaces WHERE is_occupied = 0 ORDER BY zone, space_id LIMIT ?",
        (limit,)
    )
    return [dict(r) for r in rows]


def assign_space(plate_text):
    """Assign the first available space to a plate, routing VIPs to premium Ground Floor spots. Returns space_id or None."""
    # Look up vehicle profile
    profile = db.fetchone("SELECT profile_type FROM vehicle_profiles WHERE plate_text = ?", (plate_text,))
    profile_type = profile["profile_type"] if profile else "normal"

    if profile_type == "blacklist":
        db.log_activity("security_alert", f"BOLO ALERT: Blacklisted vehicle {plate_text} detected! Notify security.", plate_text)

    row = None
    if profile_type == "vip":
        # Route to nearest Ground floor space
        row = db.fetchone("SELECT space_id FROM parking_spaces WHERE is_occupied = 0 AND floor = 'G' ORDER BY space_id ASC LIMIT 1")
    
    if not row:
        # Fallback to standard search prioritizing G -> 1 -> 2 floors
        row = db.fetchone(
            "SELECT space_id FROM parking_spaces WHERE is_occupied = 0 "
            "ORDER BY CASE floor WHEN 'G' THEN 1 WHEN '1' THEN 2 WHEN '2' THEN 3 END ASC, space_id ASC LIMIT 1"
        )
        
    if not row:
        return None

    space_id = row["space_id"]
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.execute(
        "UPDATE parking_spaces SET is_occupied = 1, plate_text = ?, entry_time = ? WHERE space_id = ?",
        (plate_text, now, space_id), commit=True
    )
    db.execute(
        "UPDATE detected_plates SET is_parked = 1 WHERE plate_text = ? AND is_parked = 0",
        (plate_text,), commit=True
    )

    # Update session counters
    session_id = db.get_current_session_id()
    if session_id:
        db.execute(
            "UPDATE sessions SET spaces_used = spaces_used + 1 WHERE id = ?",
            (session_id,), commit=True
        )

    if profile_type == "vip":
        db.log_activity("vip_entry", f"VIP {plate_text} routed to premium spot {space_id}", plate_text, space_id)
    else:
        db.log_activity("space_assigned", f"Plate {plate_text} assigned to {space_id}", plate_text, space_id)
        
    return space_id


def release_space(space_id):
    """Release a parking space, calculate stay duration and financial tariff."""
    row = db.fetchone(
        "SELECT plate_text, entry_time FROM parking_spaces WHERE space_id = ? AND is_occupied = 1",
        (space_id,)
    )
    if not row:
        return None

    plate_text = row["plate_text"]
    entry_time = row["entry_time"]
    now = datetime.datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # Calculate duration
    duration_min = 0
    if entry_time:
        try:
            entry_dt = datetime.datetime.strptime(entry_time, "%Y-%m-%d %H:%M:%S")
            duration_min = int((now - entry_dt).total_seconds() / 60)
        except ValueError:
            pass

    # Calculate payment amount based on tariff
    amount = 0.0
    if duration_min >= 0:
        import config
        import math
        rate = getattr(config, "PARKING_RATE_PER_HOUR", 20)
        if duration_min > 5:
            # Hourly billing, rounded up
            amount = float(math.ceil(duration_min / 60.0) * rate)
        else:
            # Under 5 mins is flat test rate
            amount = 10.0

    # Clear the space
    db.execute(
        "UPDATE parking_spaces SET is_occupied = 0, plate_text = NULL, entry_time = NULL WHERE space_id = ?",
        (space_id,), commit=True
    )

    # Update plate record
    if plate_text:
        db.execute(
            "UPDATE detected_plates SET is_parked = 0, exit_time = ?, duration_minutes = ?, amount_paid = ? WHERE plate_text = ? AND is_parked = 1",
            (now_str, duration_min, amount, plate_text), commit=True
        )

    db.log_activity(
        "space_released",
        f"Space {space_id} released (was {plate_text or 'unknown'}, {duration_min} min, paid: {amount} INR)",
        plate_text, space_id
    )
    
    return {
        "space_id": space_id,
        "plate_text": plate_text,
        "duration_minutes": duration_min,
        "amount_paid": amount
    }


def record_detection(plate_text, state, confidence):
    """Record a newly detected plate."""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO detected_plates (plate_text, state, timestamp, confidence) VALUES (?, ?, ?, ?)",
        (plate_text, state, now, confidence), commit=True
    )

    # Update session counter
    session_id = db.get_current_session_id()
    if session_id:
        db.execute(
            "UPDATE sessions SET plates_detected = plates_detected + 1 WHERE id = ?",
            (session_id,), commit=True
        )

    db.log_activity("plate_detected", f"Detected plate: {plate_text} ({state})", plate_text)


def get_recent_plates(limit=10):
    """Get recently detected plates."""
    rows = db.fetchall(
        "SELECT id, plate_text, state, timestamp, is_parked, confidence FROM detected_plates ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    return [dict(r) for r in rows]


def get_plate_by_id(plate_id):
    """Get a single plate record."""
    row = db.fetchone(
        "SELECT id, plate_text, state, timestamp, is_parked, exit_time, duration_minutes, confidence FROM detected_plates WHERE id = ?",
        (plate_id,)
    )
    return dict(row) if row else None


def get_activity_log(limit=50):
    """Get recent activity log entries."""
    rows = db.fetchall(
        "SELECT id, timestamp, event_type, description, plate_text, space_id FROM activity_log ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    return [dict(r) for r in rows]


def get_session_info():
    """Get current session information."""
    row = db.fetchone("SELECT * FROM sessions ORDER BY id DESC LIMIT 1")
    if not row:
        return None
    info = dict(row)

    # Calculate uptime
    try:
        start = datetime.datetime.strptime(info["start_time"], "%Y-%m-%d %H:%M:%S")
        uptime = datetime.datetime.now() - start
        info["uptime_seconds"] = int(uptime.total_seconds())
        info["uptime_display"] = str(uptime).split(".")[0]  # HH:MM:SS
    except (ValueError, KeyError):
        info["uptime_seconds"] = 0
        info["uptime_display"] = "00:00:00"

    return info


def get_analytics_data():
    """Get heatmap utilization and occupancy predictions."""
    import math
    
    # 1. Heatmap: Count assignments per space
    rows = db.fetchall(
        "SELECT space_id, COUNT(*) as count FROM activity_log WHERE event_type = 'space_assigned' GROUP BY space_id"
    )
    heatmap = {r["space_id"]: r["count"] for r in rows}
    
    # Ensure all spaces are present in the heatmap dictionary
    all_spaces = get_all_spaces()
    for s in all_spaces:
        if s["space_id"] not in heatmap:
            heatmap[s["space_id"]] = 0
            
    # 2. Predictive occupancy: Hour by hour (0-23)
    hourly_entries = [0] * 24
    rows_hr = db.fetchall(
        "SELECT strftime('%H', timestamp) as hr, COUNT(*) as count FROM detected_plates GROUP BY hr"
    )
    for r in rows_hr:
        try:
            hr = int(r["hr"])
            hourly_entries[hr] = r["count"]
        except (ValueError, TypeError):
            pass

    # Generate a smooth predictive baseline (sinusoidal business hours) scaled to lot size
    total_spaces = len(all_spaces) if all_spaces else 24
    predictions = []
    for hr in range(24):
        # Sine wave peaking at 14:00 (2 PM) and bottoming at 04:00 AM
        val = 0.15 + 0.65 * (0.5 + 0.5 * math.sin(math.pi * (hr - 8) / 12))
        # Add small weight from historical entries
        hist_weight = min(hourly_entries[hr] * 0.1, 0.2)
        val = min(max(val + hist_weight, 0.05), 0.95)
        predictions.append(round(val * total_spaces, 1))

    # 3. Actual occupancy of today so far (hour by hour)
    today = datetime.date.today().isoformat()
    actual_today = [None] * 24
    current_hour = datetime.datetime.now().hour
    
    log_rows = db.fetchall(
        "SELECT timestamp, event_type FROM activity_log WHERE timestamp LIKE ? ORDER BY timestamp ASC",
        (f"{today}%",)
    )
    
    # Find active slots before today to set baseline
    pre_today = db.fetchone(
        "SELECT COUNT(*) as c FROM detected_plates WHERE timestamp < ? AND is_parked = 1",
        (f"{today} 00:00:00",)
    )["c"]
    curr_occ = pre_today
    
    hourly_events = {hr: [] for hr in range(24)}
    for row in log_rows:
        try:
            dt = datetime.datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S")
            hourly_events[dt.hour].append(row["event_type"])
        except ValueError:
            pass
            
    for hr in range(24):
        if hr > current_hour:
            break
        # Process events in this hour
        for ev in hourly_events[hr]:
            if ev == "space_assigned":
                curr_occ = min(curr_occ + 1, total_spaces)
            elif ev == "space_released":
                curr_occ = max(curr_occ - 1, 0)
        actual_today[hr] = curr_occ
        
    return {
        "heatmap": heatmap,
        "predictions": predictions,
        "actual_today": actual_today,
        "current_hour": current_hour
    }


def get_billing_stats():
    """Calculate revenue ledger and retrieve recent payment transactions."""
    total_rev_row = db.fetchone("SELECT SUM(amount_paid) as sum FROM detected_plates")
    total_revenue = float(total_rev_row["sum"]) if total_rev_row and total_rev_row["sum"] is not None else 0.0

    total_trans_row = db.fetchone("SELECT COUNT(*) as count FROM detected_plates WHERE amount_paid > 0")
    total_transactions = total_trans_row["count"] if total_trans_row else 0

    avg_transaction = round(total_revenue / total_transactions, 2) if total_transactions > 0 else 0.0

    recent_rows = db.fetchall(
        "SELECT plate_text, exit_time, duration_minutes, amount_paid FROM detected_plates "
        "WHERE exit_time IS NOT NULL AND amount_paid > 0 ORDER BY exit_time DESC LIMIT 10"
    )
    recent_transactions = [dict(r) for r in recent_rows]

    return {
        "total_revenue": total_revenue,
        "total_transactions": total_transactions,
        "avg_transaction": avg_transaction,
        "recent_transactions": recent_transactions
    }


