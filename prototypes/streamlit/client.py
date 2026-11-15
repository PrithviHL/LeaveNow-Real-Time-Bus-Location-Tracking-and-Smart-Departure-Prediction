"""Small server-side client for the shared LeaveNow API; no RTS credential here."""

import json
import math
import os
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


class ApiError(Exception):
    """User-safe API connectivity or validation failure."""


def api_request(endpoint, payload=None):
    base = os.environ.get("LEAVENOW_API_URL", "http://127.0.0.1:3001").rstrip("/")
    parsed = urlparse(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ApiError(
            "LEAVENOW_API_URL must be an HTTP(S) service URL without credentials."
        )
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        base + endpoint,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=55) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            message = json.loads(error.read()).get(
                "error", "The API rejected this request."
            )
        except (ValueError, AttributeError):
            message = "The API rejected this request."
        raise ApiError(message) from None
    except (URLError, TimeoutError, OSError):
        raise ApiError(
            "The LeaveNow API could not be reached. Check that the backend is running and try again."
        ) from None
    except ValueError:
        raise ApiError("The API returned an unreadable response.") from None
    if not isinstance(result, dict):
        raise ApiError("The API returned an unexpected response.")
    return result


def search_stops(query):
    if not 2 <= len(query.strip()) <= 100:
        raise ApiError("Enter between 2 and 100 characters to search RTS stop names.")
    return api_request("/api/places?" + urlencode({"q": query.strip()}))["results"]


def coordinate(lat, lon):
    lat, lon = float(lat), float(lon)
    if (
        not math.isfinite(lat)
        or not math.isfinite(lon)
        or abs(lat) > 90
        or abs(lon) > 180
    ):
        raise ValueError("Choose valid latitude and longitude values.")
    return {"lat": lat, "lon": lon}


def clock_time(timestamp):
    return (
        datetime.fromtimestamp(timestamp / 1000, ZoneInfo("America/New_York"))
        .strftime("%I:%M %p")
        .lstrip("0")
    )


def travel_timestamp(day, clock):
    """Convert a Rochester wall time to UTC and reject nonexistent DST times."""
    zone = ZoneInfo("America/New_York")
    value = datetime.combine(day, clock).replace(tzinfo=zone)
    if datetime.fromtimestamp(value.timestamp(), zone).replace(
        tzinfo=None
    ) != value.replace(tzinfo=None):
        raise ValueError(
            "That local time does not exist because of the daylight-saving clock change."
        )
    return int(value.timestamp() * 1000)


def stop_catalog():
    """Public stop names and coordinates for instant client-side autocomplete."""
    return api_request("/api/stops")["results"]
