import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { distance } from "./planner.js";

const SPEED = 65,
  CELL = 0.002;
class Heap {
  constructor() {
    this.items = [];
  }
  push(item) {
    let i = this.items.length;
    this.items.push(item);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.items[p][0] <= item[0]) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0],
      last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (
          c + 1 < this.items.length &&
          this.items[c + 1][0] < this.items[c][0]
        )
          c++;
        if (this.items[c][0] >= last[0]) break;
        this.items[i] = this.items[c];
        i = c;
      }
      this.items[i] = last;
    }
    return first;
  }
  get size() {
    return this.items.length;
  }
}
const point = (p) => ({ lon: p[0], lat: p[1] });
export class WalkingGraph {
  static load(
    file = new URL("./walking-data/gainesville.json.gz", import.meta.url),
  ) {
    return new WalkingGraph(JSON.parse(gunzipSync(readFileSync(file))));
  }
  constructor(data) {
    if (data.schema !== 1 || !data.nodes?.length || !data.segments?.length)
      throw Error("Invalid walking graph");
    this.data = data;
    this.speed = SPEED;
    this.cache = new Map();
    this.snaps = new Map();
    this.grid = new Map();
    const count = data.nodes.length,
      edges = data.segments.reduce((n, s) => n + (s[4] ? 2 : 1), 0);
    this.head = new Int32Array(count).fill(-1);
    this.next = new Int32Array(edges);
    this.targets = new Int32Array(edges);
    this.edgeSegments = new Int32Array(edges);
    this.components = Int32Array.from({ length: count }, (_, i) => i);
    this.distances = new Float64Array(count);
    this.previous = new Int32Array(count);
    this.generations = new Uint32Array(count);
    this.generation = 0;
    const root = (i) => {
      while (this.components[i] !== i) {
        this.components[i] = this.components[this.components[i]];
        i = this.components[i];
      }
      return i;
    };
    let cursor = 0;
    const add = (u, v, s) => {
      this.targets[cursor] = v;
      this.edgeSegments[cursor] = s;
      this.next[cursor] = this.head[u];
      this.head[u] = cursor++;
    };
    data.segments.forEach((s, id) => {
      const [u, v, length, extra, both] = s;
      if (
        !Number.isInteger(u) ||
        !Number.isInteger(v) ||
        !data.nodes[u] ||
        !data.nodes[v] ||
        !(length > 0) ||
        !Number.isFinite(extra) ||
        extra < 0
      )
        throw Error("Invalid walking edge");
      add(u, v, id);
      if (both) add(v, u, id);
      this.components[root(u)] = root(v);
      const a = data.nodes[u],
        b = data.nodes[v];
      for (
        let x = Math.floor(Math.min(a[0], b[0]) / CELL);
        x <= Math.floor(Math.max(a[0], b[0]) / CELL);
        x++
      )
        for (
          let y = Math.floor(Math.min(a[1], b[1]) / CELL);
          y <= Math.floor(Math.max(a[1], b[1]) / CELL);
          y++
        ) {
          const key = x + "," + y;
          let ids = this.grid.get(key);
          if (!ids) {
            ids = [];
            this.grid.set(key, ids);
          }
          ids.push(id);
        }
    });
    for (let i = 0; i < count; i++) this.components[i] = root(i);
  }
  metadata() {
    return {
      source: "OpenStreetMap",
      osmTimestamp: this.data.osmTimestamp,
      license: "ODbL-1.0",
      speedMetersPerMinute: SPEED,
      snapLimitMeters: 60,
      crossingAllowanceSeconds: 15,
    };
  }
  snap(p) {
    const key = p.lon.toFixed(6) + "," + p.lat.toFixed(6);
    if (this.snaps.has(key)) return this.snaps.get(key);
    const [south, west, north, east] = this.data.bbox;
    if (p.lat < south || p.lat > north || p.lon < west || p.lon > east)
      return null;
    const x = Math.floor(p.lon / CELL),
      y = Math.floor(p.lat / CELL),
      cos = Math.cos((p.lat * Math.PI) / 180);
    let best = null;
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const id of this.grid.get(x + dx + "," + (y + dy)) || []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const s = this.data.segments[id],
            a = this.data.nodes[s[0]],
            b = this.data.nodes[s[1]];
          const vx = (b[0] - a[0]) * cos,
            vy = b[1] - a[1],
            den = vx * vx + vy * vy;
          const t = den
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((p.lon - a[0]) * cos * vx + (p.lat - a[1]) * vy) / den,
                ),
              )
            : 0;
          const projected = {
              lon: a[0] + (b[0] - a[0]) * t,
              lat: a[1] + (b[1] - a[1]) * t,
            },
            meters = distance(p, projected);
          if (meters <= 60 && (!best || meters < best.meters))
            best = { id, t, point: projected, meters };
        }
    if (this.snaps.size >= 4096) this.snaps.clear();
    this.snaps.set(key, best);
    return best;
  }
  route(a, b) {
    if (distance(a, b) < 1)
      return {
        status: "routed",
        source: "osm",
        meters: 0,
        seconds: 0,
        path: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
        accessMeters: 0,
      };
    const key = [a.lon, a.lat, b.lon, b.lat].map((n) => n.toFixed(6)).join(",");
    if (this.cache.has(key)) return this.cache.get(key);
    const result = this.find(a, b);
    if (this.cache.size >= 1500) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
  find(a, b) {
    const start = this.snap(a),
      end = this.snap(b);
    if (!start || !end)
      return { status: "unavailable", reason: "No nearby mapped footpath" };
    const s = this.data.segments[start.id],
      t = this.data.segments[end.id];
    if (this.components[s[0]] !== this.components[t[0]])
      return {
        status: "unreachable",
        reason: "Mapped walking networks are disconnected",
      };
    const crossing = (n) => Number(this.data.nodes[n][2]) || 0;
    const travel = (seg, fraction) =>
      fraction * ((seg[2] * 60) / SPEED + seg[3]);
    const access = ((start.meters + end.meters) * 60) / SPEED;
    let best = { cost: Infinity, node: -1, direct: false };
    if (start.id === end.id && (s[4] || end.t >= start.t))
      best = {
        cost:
          access +
          travel(s, Math.abs(end.t - start.t)) +
          (end.t === 1 && end.t > start.t
            ? crossing(s[1])
            : end.t === 0 && end.t < start.t
              ? crossing(s[0])
              : 0),
        node: -1,
        direct: true,
      };
    const distances = this.distances,
      previous = this.previous,
      stamps = this.generations,
      heap = new Heap();
    if (++this.generation >= 0xffffffff) {
      stamps.fill(0);
      this.generation = 1;
    }
    const generation = this.generation;
    const heuristic = (n) =>
      (distance(point(this.data.nodes[n]), end.point) * 60) / SPEED +
      (end.meters * 60) / SPEED;
    const addStart = (node, cost) => {
      if (stamps[node] !== generation || cost < distances[node]) {
        stamps[node] = generation;
        distances[node] = cost;
        previous[node] = -2;
        heap.push([cost + heuristic(node), cost, node]);
      }
    };
    addStart(
      s[1],
      (start.meters * 60) / SPEED +
        travel(s, 1 - start.t) +
        (start.t < 1 ? crossing(s[1]) : 0),
    );
    if (s[4] || start.t < 1e-9)
      addStart(
        s[0],
        (start.meters * 60) / SPEED +
          travel(s, start.t) +
          (start.t > 0 ? crossing(s[0]) : 0),
      );
    const targets = new Map([
      [
        t[0],
        travel(t, end.t) +
          (end.t === 1 ? crossing(t[1]) : 0) +
          (end.meters * 60) / SPEED,
      ],
    ]);
    if (t[4] || end.t > 1 - 1e-9)
      targets.set(
        t[1],
        travel(t, 1 - end.t) +
          (end.t === 0 ? crossing(t[0]) : 0) +
          (end.meters * 60) / SPEED,
      );
    while (heap.size) {
      const [estimate, cost, node] = heap.pop();
      if (stamps[node] !== generation || cost !== distances[node]) continue;
      if (estimate >= best.cost || estimate > 2400) break;
      if (targets.has(node) && cost + targets.get(node) < best.cost)
        best = { cost: cost + targets.get(node), node, direct: false };
      for (let edge = this.head[node]; edge !== -1; edge = this.next[edge]) {
        const to = this.targets[edge],
          seg = this.data.segments[this.edgeSegments[edge]],
          next = cost + travel(seg, 1) + crossing(to);
        if ((stamps[to] === generation && next >= distances[to]) || next > 2400)
          continue;
        stamps[to] = generation;
        distances[to] = next;
        previous[to] = node;
        heap.push([next + heuristic(to), next, to]);
      }
    }
    if (!Number.isFinite(best.cost) || best.cost > 2400)
      return {
        status: "unreachable",
        reason: "No mapped walking route within the search bound",
      };
    const middle = [];
    if (!best.direct) {
      let node = best.node;
      while (node >= 0) {
        middle.push(this.data.nodes[node].slice(0, 2));
        if (previous[node] === -2) break;
        node = previous[node];
      }
      middle.reverse();
    }
    const path = [
      [a.lon, a.lat],
      [start.point.lon, start.point.lat],
      ...middle,
      [end.point.lon, end.point.lat],
      [b.lon, b.lat],
    ].filter((p, i, all) => !i || distance(point(all[i - 1]), point(p)) > 0.05);
    let meters = 0;
    for (let i = 1; i < path.length; i++)
      meters += distance(point(path[i - 1]), point(path[i]));
    return {
      status: "routed",
      source: "osm",
      meters: Math.ceil(meters),
      seconds: Math.ceil(best.cost),
      path,
      accessMeters: Math.ceil(start.meters + end.meters),
    };
  }
}
