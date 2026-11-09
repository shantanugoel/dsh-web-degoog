
import assert from 'node:assert/strict';

let captured;
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => { captured = entry; },
  },
};

await import('../lib/client.js');
assert.equal(captured.id, 'dsh-web-degoog');
assert.equal(typeof captured.factory, 'function');

function h(type, props, ...children) {
  return { type, props: props ?? {}, children: children.flat(Infinity) };
}
const fakeScope = {
  getSnapshot: () => ({
    status: 'ready',
    writable: true,
    revision: 1,
    value: { serverUrl: 'https://degoog.example.com', apiKeyEnv: 'DEGOOG_API_KEY', searchType: 'web', lang: '' },
    user: { serverUrl: 'https://degoog.example.com' },
    base: {},
  }),
  subscribe: () => () => {},
  mutate: async () => true,
};
const React = {
  createElement: h,
  createContext: (value) => {
    const context = { value };
    context.Provider = function Provider(props) { return props.children; };
    context.Consumer = function Consumer(props) { return props.children(value); };
    return context;
  },
  useContext: () => fakeScope,
  useId: () => 'test',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
const exports = captured.factory((spec) => {
  if (spec === 'react') return React;
  throw new Error('unexpected require: ' + spec);
});
assert.deepEqual(exports.inject, ['slots', 'configForms']);
assert.equal(typeof exports.apply, 'function');

let registration;
const ctx = {
  configForms: {
    get: (ns) => { assert.equal(ns, 'web-search-degoog'); return fakeScope; },
    whileServed: (namespaces, register) => { assert.deepEqual(namespaces, ['web-search-degoog']); return register(new Set(namespaces)); },
  },
  slots: {
    inject: (name, register) => { assert.equal(name, 'plugins.row.config'); return register(); },
    register: (options, component) => { registration = { options, component }; return () => {}; },
  },
  effect: (factory) => { const off = factory(); return off; },
};
exports.apply(ctx);
assert.deepEqual(registration.options, { name: 'plugins.row.config', key: 'dsh-web-degoog#web-search-degoog' });

const tree = registration.component({ view: 'page', form: {} });
assert.equal(tree.props.value, fakeScope); // ScopeContext.Provider
const pageElement = tree.children[0];
const page = pageElement.type(pageElement.props);
assert.equal(page.props.className, 'dshwd_page');
const summaryTree = registration.component({ view: 'summary' });
const summaryElement = summaryTree.children[0];
const summary = summaryElement.type(summaryElement.props);
assert.equal(summary.type, 'span');
console.log('client smoke ok');
