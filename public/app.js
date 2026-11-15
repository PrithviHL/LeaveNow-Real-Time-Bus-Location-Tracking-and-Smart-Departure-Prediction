const $ = (s) => document.querySelector(s);
const state = {
  origin: null,
  destination: null,
  picking: null,
  plan: null,
  version: 0,
  busy: false,
  lastVehicles: [],
};
const map = L.map("map", { zoomControl: false }).setView(
  [43.157, -77.6109],
  13,
);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
const tripLayer = L.layerGroup().addTo(map),
  vehicleLayer = L.layerGroup().addTo(map);
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});
function el(tag, text = "", cls = "") {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function status(text, kind = "") {
  $("#status").hidden = !text;
  $("#status").textContent = text;
  $("#status").className = kind;
}
async function api(url, body, signal) {
  const response = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please retry.");
  return data;
}
let planController;
function invalidate() {
  state.version++;
  planController?.abort();
  state.plan = null;
  state.selectedJourneyId = null;
  state.busy = false;
  $("#find").disabled = false;
  $("#find").replaceChildren(
    document.createTextNode("Find my next bus "),
    el("span", "→"),
  );
  $("#results").replaceChildren();
  $("#empty-state").hidden = false;
  status("");
  drawTrip();
}
function drawTrip(journey = null, fit = false) {
  tripLayer.clearLayers();
  const bounds = [];
  for (const key of ["origin", "destination"])
    if (state[key]) {
      const p = state[key];
      bounds.push([p.lat, p.lon]);
      L.circleMarker([p.lat, p.lon], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: key === "origin" ? "#e98933" : "#214f47",
        fillOpacity: 1,
      })
        .addTo(tripLayer)
        .bindPopup(
          el(
            "span",
            key === "origin" ? "Your starting location" : "Your destination",
          ),
        );
    }
  if (journey) {
    for (const [stop, label] of [
      [journey.boarding, "Board here"],
      [journey.alighting, "Get off here"],
    ]) {
      bounds.push([stop.lat, stop.lon]);
      L.circleMarker([stop.lat, stop.lon], {
        radius: 7,
        color: "#365e8b",
        weight: 3,
        fillColor: "#fff",
        fillOpacity: 1,
      })
        .addTo(tripLayer)
        .bindPopup(el("span", `${label}: ${stop.name}`));
    }
    L.polyline(
      [
        [state.origin.lat, state.origin.lon],
        [journey.boarding.lat, journey.boarding.lon],
      ],
      { color: "#e98933", weight: 3, dashArray: "3 7" },
    ).addTo(tripLayer);
    L.polyline(
      [
        [journey.boarding.lat, journey.boarding.lon],
        [journey.alighting.lat, journey.alighting.lon],
      ],
      { color: "#365e8b", weight: 4, dashArray: "8 8" },
    ).addTo(tripLayer);
    L.polyline(
      [
        [journey.alighting.lat, journey.alighting.lon],
        [state.destination.lat, state.destination.lon],
      ],
      { color: "#214f47", weight: 3, dashArray: "3 7" },
    ).addTo(tripLayer);
  }
  if (fit && bounds.length)
    map.fitBounds(bounds, { padding: [70, 80], maxZoom: 16 });
}
function setPoint(key, p, label, fit = true) {
  invalidate();
  state[key] = { lat: p.lat, lon: p.lon };
  $(`#${key}`).value = label;
  $(`#${key}`).classList.add("chosen");
  hideSuggestions(key);
  drawTrip(null, fit);
  setPicking(null);
}
function setPicking(key) {
  state.picking = key;
  $("#map-hint").hidden = !key;
  $("#map").classList.toggle("picking", Boolean(key));
  document
    .querySelectorAll("[data-pick]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.pick === key));
  if (key) {
    $("#map-hint-text").textContent =
      `Click the map to set your ${key === "origin" ? "starting point" : "destination"}`;
    if (innerWidth < 800)
      $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
map.on("click", (e) => {
  if (state.picking)
    setPoint(
      state.picking,
      { lat: e.latlng.lat, lon: e.latlng.lng },
      `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
      false,
    );
});
document.querySelectorAll("[data-pick]").forEach((b) => {
  b.onclick = () =>
    setPicking(state.picking === b.dataset.pick ? null : b.dataset.pick);
});
$("#cancel-pick").onclick = () => setPicking(null);
$("#recenter").onclick = () => {
  if (state.origin || state.destination)
    drawTrip(
      state.plan?.journeys.find(
        (journey) => journey.id === state.selectedJourneyId,
      ),
      true,
    );
  else map.setView([43.157, -77.6109], 13);
};
function hideSuggestions(key) {
  $(`#${key}-results`).hidden = true;
  $(`#${key}`).setAttribute("aria-expanded", "false");
}
function coordinates(text) {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180
    ? { lat: +m[1], lon: +m[2] }
    : null;
}
for (const key of ["origin", "destination"]) {
  let timer,
    controller,
    sequence = 0;
  const input = $(`#${key}`),
    list = $(`#${key}-results`);
  input.addEventListener("input", () => {
    invalidate();
    state[key] = null;
    input.classList.remove("chosen");
    drawTrip();
    clearTimeout(timer);
    controller?.abort();
    const current = ++sequence;
    const query = input.value.trim();
    hideSuggestions(key);
    if (query.length < 2) return;
    const coords = coordinates(query);
    if (coords) {
      setPoint(key, coords, query, false);
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const data = await api(
          `/api/places?q=${encodeURIComponent(query)}`,
          null,
          controller.signal,
        );
        if (current !== sequence || input.value.trim() !== query) return;
        list.replaceChildren();
        if (!data.results.length)
          list.append(
            el(
              "li",
              "No matching stop. Try a nearby intersection or choose on the map.",
              "no-results",
            ),
          );
        for (const place of data.results) {
          const li = el("li");
          li.setAttribute("role", "option");
          const button = el("button");
          button.type = "button";
          button.append(
            el("strong", place.name),
            el("small", `RTS stop ${place.id}`),
          );
          button.onclick = () => {
            sequence++;
            controller?.abort();
            setPoint(key, place, place.name);
          };
          button.onkeydown = (e) => {
            const buttons = [...list.querySelectorAll("button")];
            const i = buttons.indexOf(button);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              buttons[(i + 1) % buttons.length].focus();
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              buttons[(i + buttons.length - 1) % buttons.length].focus();
            }
            if (e.key === "Escape") {
              hideSuggestions(key);
              input.focus();
            }
          };
          li.append(button);
          list.append(li);
        }
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
      } catch (error) {
        if (error.name !== "AbortError") status(error.message, "error");
      }
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !list.hidden) {
      e.preventDefault();
      list.querySelector("button")?.focus();
    }
    if (e.key === "Escape") hideSuggestions(key);
  });
}
document.addEventListener("click", (e) => {
  for (const key of ["origin", "destination"])
    if (!e.target.closest(`#${key}-results`) && e.target !== $(`#${key}`))
      hideSuggestions(key);
});
$("#locate").onclick = () => {
  if (!navigator.geolocation)
    return status(
      "Location is unavailable in this browser. Search a stop or choose on the map.",
      "error",
    );
  $("#locate").disabled = true;
  status("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      $("#locate").disabled = false;
      setPoint(
        "origin",
        { lat: position.coords.latitude, lon: position.coords.longitude },
        "My current location",
      );
      status(
        `Location found (accuracy about ${Math.round(position.coords.accuracy)} m). Choose where you’re heading.`,
        "success",
      );
    },
    (error) => {
      $("#locate").disabled = false;
      status(
        error.code === 1
          ? "Location permission was declined. Search your nearest intersection or choose a point on the map."
          : "Could not locate you. Search a stop, enter coordinates, or choose a point on the map.",
        "error",
      );
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  );
};
function relative(time) {
  const mins = Math.ceil((time - Date.now()) / 60000);
  return mins <= 0 ? "Now" : `${mins} min`;
}
function timeNode(time, cls = "") {
  const n = el("span", relative(time), cls);
  n.dataset.time = time;
  return n;
}
function timeLabel(time) {
  return clock.format(new Date(time));
}
function timeline(journey) {
  const list = el("ol", "", "timeline");
  for (const [label, text, cls] of [
    [
      `Walk about ${journey.walkMinutes} min`,
      `To ${journey.boarding.name} · stop ${journey.boarding.id}`,
      "walk-step",
    ],
    [
      `${timeLabel(journey.departsAt)} · Board route ${journey.route}`,
      `${journey.headsign} · ${journey.rideMinutes} min ride`,
      "bus-step",
    ],
    [
      `${timeLabel(journey.arrivesAt)} · Get off`,
      `${journey.alighting.name} · stop ${journey.alighting.id}`,
      "stop-step",
    ],
    [
      `Walk about ${journey.finalWalkMinutes} min`,
      `Reach your destination around ${timeLabel(journey.destinationAt)}`,
      "walk-step",
    ],
  ]) {
    const li = el("li", "", cls);
    li.append(el("b", label), el("p", text));
    list.append(li);
  }
  return list;
}
function renderPlan(plan, selectedId = state.selectedJourneyId) {
  state.plan = plan;
  $("#empty-state").hidden = true;
  const container = $("#results");
  container.replaceChildren();
  const title = el("div", "", "section-label results-heading");
  title.append(
    el("span", "YOUR NEXT MOVE"),
    el("span", `UPDATED ${timeLabel(plan.checkedAt)}`),
  );
  container.append(title);
  if (plan.partial)
    container.append(
      el(
        "p",
        "Some stops could not be checked. These results may be incomplete.",
        "warning-note",
      ),
    );
  if (plan.nearestStop) {
    const n = el("div", "", "nearest");
    n.append(el("span", "⌖", "nearest-icon"), el("div", "", "nearest-copy"));
    n.lastChild.append(
      el("small", "CLOSEST STOP"),
      el("strong", plan.nearestStop.name),
      el(
        "span",
        `${plan.nearestStop.meters} m away · about ${plan.nearestStop.walkMinutes} min walk`,
      ),
    );
    container.append(n);
  }
  if (plan.journeys.length) {
    const best =
      plan.journeys.find((journey) => journey.id === selectedId) ||
      plan.journeys[0];
    state.selectedJourneyId = best.id;
    const card = el("article", "", "next-bus");
    const top = el("div", "", "bus-top");
    top.append(
      el("span", `RTS ${best.route}`, "route-badge"),
      el(
        "span",
        best.timingLabel === "Scheduled" ? "◷ SCHEDULED" : "● LIVE PREDICTION",
        "live-caption",
      ),
    );
    card.append(top);
    card.append(el("h2", best.headsign));
    const busTime = el("div", "", "big-time");
    busTime.append(timeNode(best.departsAt), el("small", "until your bus"));
    card.append(busTime);
    const leave = el("div", "", "leave-time");
    leave.append(el("span", "↗"), el("div"));
    leave.lastChild.append(
      el("b", `Leave by ${timeLabel(best.leaveAt)}`),
      el("small", `About ${best.walkMinutes} min walking + 2 min buffer`),
    );
    card.append(leave);
    container.append(card);
    if (best.boarding.id !== plan.nearestStop?.id)
      container.append(
        el(
          "p",
          `Board at ${best.boarding.name}. The physically closest stop has no verified catchable direct trip to this destination.`,
          "walking-note",
        ),
      );
    container.append(timeline(best));
    const directions = el(
      "a",
      "Walking directions to your boarding stop ↗",
      "directions-link",
    );
    directions.href = `https://www.google.com/maps/dir/?api=1&origin=${state.origin.lat},${state.origin.lon}&destination=${best.boarding.lat},${best.boarding.lon}&travelmode=walking`;
    directions.target = "_blank";
    directions.rel = "noopener noreferrer";
    container.append(directions);
    const more = plan.journeys
      .filter((journey) => journey.id !== best.id)
      .slice(0, 3);
    if (more.length) {
      container.append(
        el("div", "MORE DIRECT OPTIONS", "section-label alternatives-label"),
      );
      for (const journey of more) {
        const b = el("button", "", "alternative");
        b.type = "button";
        b.append(
          el("span", journey.route, "mini-route"),
          el("span", "", "alternative-copy"),
          timeNode(journey.departsAt),
        );
        b.children[1].append(
          el("b", journey.headsign),
          el(
            "small",
            `${journey.boarding.name} · ${journey.walkMinutes} min walk`,
          ),
        );
        b.onclick = () => renderPlan(plan, journey.id);
        container.append(b);
      }
    }
    drawTrip(best, true);
    $("#map-summary").replaceChildren(
      el("span", "⇄", "map-summary-icon"),
      el("div"),
    );
    $("#map-summary").lastChild.append(
      el("strong", `Route ${best.route} · ${best.direction}`),
      el("p", `${best.boarding.name} → ${best.alighting.name}`),
    );
  } else {
    container.append(
      el("h2", "Let’s find another way.", "no-trip-title"),
      el(
        "p",
        plan.reason || "No direct bus was found in the current live window.",
        "no-trip-copy",
      ),
    );
    if (plan.departures.length) {
      container.append(
        el(
          "div",
          "OTHER NEARBY DEPARTURES",
          "section-label alternatives-label",
        ),
        el(
          "p",
          "These departures are not verified to reach your destination.",
          "warning-note",
        ),
      );
      for (const d of plan.departures.slice(0, 3)) {
        const row = el("div", "", "alternative");
        row.append(
          el("span", d.route, "mini-route"),
          el("span", "", "alternative-copy"),
          timeNode(d.departsAt),
        );
        row.children[1].append(
          el("b", d.headsign),
          el(
            "small",
            `${d.stop.name}${d.catchable ? "" : " · too soon to reach"}`,
          ),
        );
        container.append(row);
      }
    }
    const link = el(
      "a",
      "Check RTS maps & trip planning ↗",
      "directions-link",
    );
    link.href = "https://www.myrts.com/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(link);
    drawTrip(null, true);
    $("#map-summary").replaceChildren(
      el("span", "⌖", "map-summary-icon"),
      el("div"),
    );
    $("#map-summary").lastChild.append(
      el("strong", "Your start and destination"),
      el("p", "Try nearby stops or a longer walking limit."),
    );
  }
  const refresh = el("button", "↻ Refresh live arrivals", "refresh");
  refresh.type = "button";
  refresh.onclick = () => submitPlan();
  container.append(refresh);
  container.append(
    el(
      "p",
      "Times are in Rochester local time. Walking is estimated, not street-routed. Dotted lines show connections only. Live times can change.",
      "walking-note",
    ),
  );
}
async function submitPlan(background = false) {
  if (state.busy) return;
  for (const key of ["origin", "destination"])
    if (!state[key]) {
      const p = coordinates($(`#${key}`).value);
      if (p) setPoint(key, p, $(`#${key}`).value, false);
      else {
        status(
          `Choose a ${key === "origin" ? "starting location" : "destination"} from search results, use coordinates, or select it on the map.`,
          "error",
        );
        $(`#${key}`).focus();
        return;
      }
    }
  state.busy = true;
  const version = state.version;
  planController = new AbortController();
  $("#find").disabled = true;
  $("#find").textContent = "Checking live buses…";
  if (!background) status("Finding nearby stops and matching live trips…");
  try {
    const data = await api(
      "/api/plan",
      {
        origin: state.origin,
        destination: state.destination,
        maxWalk: +$("#max-walk").value,
        mode: "leave_now",
        maxTransfers: 0,
      },
      planController.signal,
    );
    if (version !== state.version) return;
    renderPlan(data);
    status("");
  } catch (error) {
    if (error.name !== "AbortError" && version === state.version)
      status(error.message, "error");
  } finally {
    if (version === state.version) {
      state.busy = false;
      $("#find").disabled = false;
      $("#find").replaceChildren(
        document.createTextNode("Find my next bus "),
        el("span", "→"),
      );
    }
  }
}
$("#planner").onsubmit = (e) => {
  e.preventDefault();
  submitPlan();
};
$("#max-walk").onchange = invalidate;
$("#sample").onclick = async () => {
  try {
    status("Finding a Rochester example…");
    const [a, b] = await Promise.all([
      api("/api/places?q=East%20Alexander"),
      api("/api/places?q=Park%20Berkeley"),
    ]);
    if (!a.results.length || !b.results.length)
      throw new Error(
        "Example stops are unavailable. Choose your own locations.",
      );
    setPoint("origin", a.results[0], a.results[0].name, false);
    setPoint("destination", b.results[0], b.results[0].name, true);
    submitPlan();
  } catch (error) {
    status(error.message, "error");
  }
};
async function updateVehicles() {
  try {
    const data = await api("/api/vehicles");
    state.lastVehicles = data.vehicles;
    vehicleLayer.clearLayers();
    for (const v of data.vehicles) {
      const icon = L.divIcon({
        className: "vehicle-marker",
        html: "",
        iconSize: [25, 25],
      });
      const marker = L.marker([v.lat, v.lon], {
        icon,
        title: `RTS route ${v.route}`,
        keyboard: true,
      }).addTo(vehicleLayer);
      marker.getElement().textContent = v.route;
      const popup = el("div");
      popup.append(
        el("b", `RTS ${v.route}`),
        el("p", v.label),
        el("small", `Position reported: ${v.positionTimestamp} ET`),
      );
      marker.bindPopup(popup);
    }
    $("#vehicle-count").textContent = `${data.vehicles.length} live buses`;
  } catch {
    $("#vehicle-count").textContent = "Live map unavailable";
    vehicleLayer.clearLayers();
  }
}
$("#about-open").onclick = () => $("#about").showModal();
$("#about-close").onclick = () => $("#about").close();
setInterval(() => {
  document.querySelectorAll("[data-time]").forEach((n) => {
    n.textContent = relative(+n.dataset.time);
  });
  if (state.plan && Date.now() - state.plan.checkedAt > 90_000)
    status(
      "These results are over a minute old. Refresh before heading to the stop.",
      "warning",
    );
}, 10000);
setInterval(() => {
  if (!document.hidden) updateVehicles();
}, 30000);
setInterval(() => {
  if (!document.hidden && state.plan && !state.busy) submitPlan(true);
}, 60000);
updateVehicles();
