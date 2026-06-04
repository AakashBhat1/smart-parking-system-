"""
Smart Parking System — Database Layer
Thread-safe SQLite with context manager.
"""
import sqlite3
import threading
import datetime
import config


_local = threading.local()
_lock = threading.Lock()


def get_connection():
    """Get a thread-local database connection."""
    if not hasattr(_local, "connection") or _local.connection is None:
        _local.connection = sqlite3.connect(config.DATABASE_PATH, check_same_thread=False)
        _local.connection.row_factory = sqlite3.Row
        _local.connection.execute("PRAGMA journal_mode=WAL")
        _local.connection.execute("PRAGMA foreign_keys=ON")
    return _local.connection


def execute(query, params=(), commit=False):
    """Execute a query and return results."""
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        if commit:
            conn.commit()
        return cursor


def executemany(query, params_list, commit=True):
    """Execute a query with many parameter sets."""
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.executemany(query, params_list)
        if commit:
            conn.commit()
        return cursor


def fetchone(query, params=()):
    """Fetch a single row."""
    cursor = execute(query, params)
    return cursor.fetchone()


def fetchall(query, params=()):
    """Fetch all rows."""
    cursor = execute(query, params)
    return cursor.fetchall()


def init_db():
    """Create all tables and seed initial data."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS parking_spaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id TEXT UNIQUE NOT NULL,
            zone TEXT DEFAULT 'A',
            is_occupied INTEGER DEFAULT 0,
            plate_text TEXT DEFAULT NULL,
            entry_time TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS detected_plates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate_text TEXT NOT NULL,
            state TEXT,
            timestamp TEXT NOT NULL,
            is_parked INTEGER DEFAULT 0,
            exit_time TEXT DEFAULT NULL,
            duration_minutes INTEGER DEFAULT NULL,
            confidence REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT NOT NULL,
            end_time TEXT DEFAULT NULL,
            plates_detected INTEGER DEFAULT 0,
            spaces_used INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            plate_text TEXT DEFAULT NULL,
            space_id TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            role TEXT NOT NULL,
            mode TEXT DEFAULT 'user',
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );
    """)
    conn.commit()

    # Seed parking spaces if empty
    count = cursor.execute("SELECT COUNT(*) FROM parking_spaces").fetchone()[0]
    if count == 0:
        zones = ['A', 'B', 'C']
        spaces_per_zone = config.DEFAULT_SPACES // len(zones)
        remainder = config.DEFAULT_SPACES % len(zones)
        
        space_num = 1
        for i, zone in enumerate(zones):
            n = spaces_per_zone + (1 if i < remainder else 0)
            for _ in range(n):
                cursor.execute(
                    "INSERT INTO parking_spaces (space_id, zone) VALUES (?, ?)",
                    (f"S-{space_num:02d}", zone)
                )
                space_num += 1
        conn.commit()
        log_activity("system", f"Initialized {config.DEFAULT_SPACES} parking spaces across {len(zones)} zones")

    # Start a new session
    start_session()


def start_session():
    """Record a new system session."""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(
        "INSERT INTO sessions (start_time) VALUES (?)",
        (now,), commit=True
    )
    log_activity("system", "System session started")


def get_current_session_id():
    """Get the most recent session ID."""
    row = fetchone("SELECT id FROM sessions ORDER BY id DESC LIMIT 1")
    return row["id"] if row else None


def log_activity(event_type, description, plate_text=None, space_id=None):
    """Log an event to the activity log."""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(
        "INSERT INTO activity_log (timestamp, event_type, description, plate_text, space_id) VALUES (?, ?, ?, ?, ?)",
        (now, event_type, description, plate_text, space_id),
        commit=True
    )


def close():
    """Close the thread-local connection."""
    if hasattr(_local, "connection") and _local.connection:
        _local.connection.close()
        _local.connection = None
