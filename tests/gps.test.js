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
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='component':
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
