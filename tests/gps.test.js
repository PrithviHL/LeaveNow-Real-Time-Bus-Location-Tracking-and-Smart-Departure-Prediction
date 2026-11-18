import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
const code = execFileSync(
  "python3",
  [
    "-c",
    `import ast
p=ast.parse(open('prototypes/streamlit/app.py').read())
for n in ast.walk(p):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='component' and n.args and ast.literal_eval(n.args[0])=='leavenow_gps':
  for k in n.keywords:
   if k.arg=='js': print(ast.literal_eval(k.value))
`,
  ],
  { encoding: "utf8" },
).replace("export default", "");
function setup(geo, secure = true) {
  const button = {},
    status = {},
    states = [];
  const mount = vm.runInNewContext("(" + code + ")", {
    window: { isSecureContext: secure },
    navigator: { geolocation: geo },
  });
  const cleanup = mount({
    parentElement: { querySelector: (s) => (s === "button" ? button : status) },
    setStateValue: (key, value) => states.push({ key, value }),
  });
  return { button, status, states, cleanup };
}
test("GPS has an explicit click and reports success from the browser", () => {
  let success;
  const view = setup({
    getCurrentPosition: (yes, no, opts) => {
      success = yes;
      assert.equal(opts.timeout, 15000);
    },
  });
  assert.equal(view.states.length, 0);
  view.button.onclick();
  assert.equal(view.button.disabled, true);
  success({ coords: { latitude: 29.65, longitude: -82.34, accuracy: 12 } });
  assert.equal(view.states[0].value.latitude, 29.65);
  assert.equal(view.button.disabled, false);
});
test("GPS reports denial, timeout, unavailable and unsupported distinctly", () => {
  for (const [code, expected] of [
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ]) {
    const view = setup({ getCurrentPosition: (yes, no) => no({ code }) });
    view.button.onclick();
    assert.equal(view.states[0].value.error, expected);
  }
  const view = setup(null, false);
  view.button.onclick();
  assert.equal(view.states[0].value.error, "unsupported");
});

test("a precise-location timeout falls back to a bounded approximate request", () => {
  let calls = 0;
  const view = setup({
    getCurrentPosition: (yes, no, options) => {
      calls++;
      if (calls === 1) {
        assert.equal(options.enableHighAccuracy, true);
        no({ code: 3 });
      } else {
        assert.equal(options.enableHighAccuracy, false);
        assert.equal(options.timeout, 20000);
        yes({ coords: { latitude: 29.65, longitude: -82.34, accuracy: 250 } });
      }
    },
  });
  view.button.onclick();
  assert.equal(calls, 2);
  assert.equal(view.states[0].value.accuracy, 250);
});
test("denied permission does not trigger another location request", () => {
  let calls = 0;
  const view = setup({
    getCurrentPosition: (yes, no) => {
      calls++;
      no({ code: 1 });
    },
  });
  view.button.onclick();
  assert.equal(calls, 1);
  assert.equal(view.states[0].value.error, "denied");
});
