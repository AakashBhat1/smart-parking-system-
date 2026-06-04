"""
Smart Parking System — AI Assistant Service
Dual-persona Ollama chat with live data context injection.
- User mode: helps find free spaces, answers parking questions
- Admin mode: summarizes session activity, reports analytics
"""
import json
import requests
import datetime
import config
from services import parking_service


USER_SYSTEM_PROMPT = """You are ParkBot, a friendly and helpful AI parking assistant for the Smart Parking System.
You help visitors find free parking spaces, answer questions about parking availability, duration, and rates.
Keep responses concise (2-4 sentences). Be warm and professional.
The parking rate is ₹{rate}/hour.

{context}

Answer based ONLY on the live data above. If you don't have enough info, say so politely.
Do NOT use any thinking tags or internal reasoning in your response. Respond directly."""

ADMIN_SYSTEM_PROMPT = """You are ParkBot Admin, an operations analyst for the Smart Parking System.
You help administrators understand parking activity, generate session reports, and identify trends.
Keep responses concise and data-driven. Use bullet points for clarity.

{context}

Analyze the data above to answer the admin's question. Be precise with numbers.
Do NOT use any thinking tags or internal reasoning in your response. Respond directly."""


def _build_user_context():
    """Build live parking data context for user-mode prompts."""
    stats = parking_service.get_stats()
    free_spaces = parking_service.get_free_spaces(8)
    recent = parking_service.get_recent_plates(3)

    free_list = ", ".join([f"{s['space_id']} (Zone {s['zone']})" for s in free_spaces]) if free_spaces else "None available"
    recent_list = "\n".join([f"  - {p['plate_text']} ({p['state']}) at {p['timestamp']}" for p in recent]) if recent else "  None yet"

    return f"""LIVE PARKING STATUS:
- Total spaces: {stats['total']}
- Free spaces: {stats['free']}
- Occupied: {stats['occupied']}
- Occupancy rate: {stats['occupancy_pct']}%
- Available spaces: {free_list}
- Recent detections:
{recent_list}"""


def _build_admin_context():
    """Build session and activity context for admin-mode prompts."""
    stats = parking_service.get_stats()
    session = parking_service.get_session_info()
    activity = parking_service.get_activity_log(20)

    session_info = "No active session"
    if session:
        session_info = f"""Session started: {session['start_time']}
  Uptime: {session['uptime_display']}
  Plates detected this session: {session['plates_detected']}
  Spaces used this session: {session['spaces_used']}"""

    activity_lines = "\n".join([
        f"  [{e['timestamp']}] {e['event_type']}: {e['description']}"
        for e in activity[:20]
    ]) if activity else "  No activity recorded"

    return f"""SESSION REPORT:
{session_info}

CURRENT STATUS:
- Total spaces: {stats['total']}, Free: {stats['free']}, Occupied: {stats['occupied']}
- Occupancy rate: {stats['occupancy_pct']}%
- Plates detected today: {stats['plates_today']}

RECENT ACTIVITY LOG:
{activity_lines}"""


def _get_system_prompt(mode):
    """Build the full system prompt with injected live data."""
    if mode == "admin":
        context = _build_admin_context()
        return ADMIN_SYSTEM_PROMPT.format(context=context)
    else:
        context = _build_user_context()
        return USER_SYSTEM_PROMPT.format(context=context, rate=config.PARKING_RATE_PER_HOUR)


def chat_stream(user_message, mode="user", history=None):
    """
    Send a message to Ollama and yield response chunks (streaming).
    history: list of {"role": "user"|"assistant", "content": "..."} dicts
    """
    system_prompt = _get_system_prompt(mode)

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (last 6 exchanges)
    if history:
        for msg in history[-12:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    try:
        response = requests.post(
            f"{config.OLLAMA_BASE_URL}/api/chat",
            json={
                "model": config.OLLAMA_MODEL,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 300,
                }
            },
            stream=True,
            timeout=30,
        )
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue

    except requests.exceptions.ConnectionError:
        yield "⚠️ Cannot connect to Ollama. Please make sure it's running (`ollama serve`)."
    except requests.exceptions.Timeout:
        yield "⚠️ Ollama took too long to respond. Try again."
    except Exception as e:
        yield f"⚠️ Error: {str(e)}"


def chat_sync(user_message, mode="user", history=None):
    """Non-streaming chat — returns full response string."""
    chunks = list(chat_stream(user_message, mode, history))
    return "".join(chunks)
