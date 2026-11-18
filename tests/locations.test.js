import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
const code = execFileSync(
  "python3",
  [
    "-c",
    `import ast
for n in ast.walk(ast.parse(open('prototypes/streamlit/app.py').read())):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='component' and n.args and ast.literal_eval(n.args[0])=='leavenow_location_picker':
  for k in n.keywords:
   if k.arg=='js': print(ast.literal_eval(k.value))
`,
  ],
  { encoding: "utf8" },
).replace("export default", "");
class Element {
  constructor() {
    this.value = "";
    this.dataset = {};
    this.children = [];
    this.attrs = {};
    this.listeners = {};
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  append(...items) {
    this.children.push(...items);
  }
  replaceChildren(...items) {
    this.children = items;
  }
  addEventListener(k, fn) {
    this.listeners[k] = fn;
  }
  removeEventListener(k, fn) {
    if (this.listeners[k] === fn) delete this.listeners[k];
  }
  fire(k, extra = {}) {
    this.listeners[k]?.({ preventDefault() {}, ...extra });
  }
}
function setup(initial = {}) {
  const input = new Element(),
    list = new Element(),
    events = [],
    timers = new Map();
  let timerId = 0,
    cleanup;
  const mount = vm.runInNewContext("(" + code + ")", {
    document: { createElement: () => new Element() },
    setTimeout: (fn) => {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  const base = {
    id: "origin",
    label: "Starting from",
    value: "",
    command: 0,
    resolved: false,
    stops: [
      { id: "473", name: "Reitz Union" },
      { id: "1", name: "Rosa Parks" },
    ],
    places: [],
    placeQuery: "",
    ...initial,
  };
  const render = (update) => {
    cleanup?.();
    mountData = { ...base, ...update };
    cleanup = mount({
      parentElement: { querySelector: (s) => (s === "input" ? input : list) },
      data: mountData,
      setStateValue: (key, event) => events.push(event),
    });
  };
  let mountData;
  render(initial);
  return {
    input,
    list,
    events,
    render,
    flush() {
      const work = [...timers.values()];
      timers.clear();
      work.forEach((f) => f());
    },
  };
}
test("stop suggestions update immediately while typing, without Enter; place requests are debounced", () => {
  const v = setup();
  v.input.value = "Re";
  v.input.fire("input");
  assert.equal(v.list.children.length, 1);
  assert.equal(
    v.list.children[0].children[1].textContent,
    "Reitz Union · stop 473",
  );
  assert.equal(v.events.length, 0);
  v.input.value = "Rei";
  v.input.fire("input");
  v.flush();
  assert.equal(v.events.length, 1);
  assert.equal(v.events[0].value, "Rei");
});
test("a stop and place share one dropdown and clicking a suggestion cancels pending query", () => {
  const v = setup();
  v.input.value = "Reitz";
  v.input.fire("input");
  v.render({
    value: "Reitz",
    placeQuery: "Reitz",
    places: [{ id: "place:reitz:0", kind: "place", label: "Reitz Cafe" }],
  });
  assert.equal(v.list.children.length, 2);
  v.list.children[1].onclick();
  v.flush();
  assert.equal(v.events.length, 1);
  assert.equal(v.events[0].type, "select");
  assert.equal(v.events[0].id, "place:reitz:0");
});
test("late results never overwrite newer input or show stale place suggestions", () => {
  const v = setup();
  v.input.value = "Rosa";
  v.input.fire("input");
  v.render({
    value: "Reitz",
    placeQuery: "Reitz",
    places: [{ id: "place:old", kind: "place", label: "Reitz Cafe" }],
  });
  assert.equal(v.input.value, "Rosa");
  assert.equal(v.list.children.length, 1);
  assert.equal(
    v.list.children[0].children[1].textContent,
    "Rosa Parks · stop 1",
  );
});
test("keyboard selection works and editing a resolved field immediately invalidates its old point", () => {
  const v = setup({ value: "Reitz Union", resolved: true });
  v.input.value = "Ro";
  v.input.fire("input");
  assert.equal(v.events[0].type, "edit");
  v.input.fire("keydown", { key: "ArrowDown" });
  v.input.fire("keydown", { key: "Enter" });
  assert.equal(v.events.at(-1).id, "stop:1");
});
test("preset/GPS commands update the field and IME input waits for composition to finish", () => {
  const v = setup();
  v.render({ command: 1, value: "Current location", resolved: true });
  assert.equal(v.input.value, "Current location");
  v.input.fire("compositionstart");
  v.input.value = "Re";
  v.input.fire("input");
  v.flush();
  assert.ok(v.events.every((e) => e.type !== "query"));
  v.input.fire("compositionend");
  v.flush();
  assert.equal(v.events.at(-1).type, "query");
});

test('Escape stays closed when place results arrive; focusing reopens suggestions',()=>{
 const v=setup();v.input.value='Reitz';v.input.fire('input');v.input.fire('keydown',{key:'Escape'});
 v.render({value:'Reitz',placeQuery:'Reitz',places:[{id:'place:reitz:0',kind:'place',label:'Reitz Cafe'}]});
 assert.equal(v.list.children.length,0);v.input.fire('focus');assert.equal(v.list.children.length,2);
});
