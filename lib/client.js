/**
 * dsh-web-degoog browser half: the configuration page for the
 * web-search-degoog profile entry.
 *
 * DSH 0.2.x renders a plugin's own configuration on the Plugins page through
 * the keyed `plugins.row.config` slot (`<package>#<row id>`). The page's host
 * supplies the active profile entry as a live, revisioned form; this module
 * binds that same entry through `ctx.configForms` so the page re-renders when
 * a write lands, and stages edits locally until Save.
 *
 * Shipped as a prebuilt lazy-CJS factory (the format the harness module
 * system serves under /plugins): no JSX, no imports outside the shell-seeded
 * externals. Visual language mirrors the built-in plugin pages using the
 * shared --dsw-alias-* design tokens.
 *
 * @module dsh-web-degoog/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-web-degoog',
	factory: (require) => {
		var module = { exports: {} };
		const React = require('react');

		const exports = module.exports;

		/** The Host profile entry this page edits. */
		const NS = 'web-search-degoog';
		/** The keyed slot key: package name + the row id the bundle patch declares. */
		const ROW_KEY = 'dsh-web-degoog#web-search-degoog';
		/** Fields the page offers, with copy and input hints. */
		const FIELDS = [
			{ key: 'serverUrl', label: 'Instance URL', placeholder: 'https://degoog.example.com', hint: 'Base URL of your degoog instance. Blank leaves search unconfigured; a selected degoog search then reports DEGOOG_SERVER_URL_MISSING.' },
			{ key: 'apiKeyEnv', label: 'API key credential name', placeholder: 'DEGOOG_API_KEY', hint: 'Credential reference resolved per search. The key value itself never lives in settings.' },
			{ key: 'searchType', label: 'Search type', placeholder: 'web', hint: "degoog's type parameter (web, images, ... depending on installed engines)." },
			{ key: 'lang', label: 'Language', placeholder: '(none)', hint: "Optional language code passed as degoog's lang parameter." },
		];

		// ---------------------------------------------------------------- styles
		// One stylesheet, injected once. Classes use the shared design tokens so
		// the page follows the active theme like the built-in plugin pages.
		const CSS_TAG = 'dsh-web-degoog/client.css';
		if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-web-degoog';
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = [
				'.dshwd_page{display:flex;flex-direction:column;gap:0}',
				'.dshwd_lede{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}',
				'.dshwd_fields{display:flex;flex-direction:column;margin-top:4px}',
				'.dshwd_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
				'.dshwd_field+.dshwd_field{border-top:1px solid var(--dsw-alias-border-l2)}',
				'.dshwd_head{align-items:center;gap:8px;display:flex}',
				'.dshwd_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
				'.dshwd_badges{align-items:center;gap:8px;display:inline-flex}',
				'.dshwd_badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}',
				'.dshwd_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}',
				'.dshwd_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
				'.dshwd_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}',
				'.dshwd_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}',
				'.dshwd_input:disabled{opacity:.6;cursor:default}',
				'.dshwd_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}',
				'.dshwd_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex;flex-wrap:wrap}',
				'.dshwd_failed{min-width:0;color:var(--dsw-alias-state-error-primary);flex:1;margin:0;font-size:12px;line-height:1.5}',
				'.dshwd_note{color:var(--dsw-alias-label-secondary);margin:12px 0;font-size:13px;line-height:1.5}',
				'.dshwd_discard,.dshwd_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}',
				'.dshwd_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}',
				'.dshwd_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}',
				'.dshwd_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
				'.dshwd_discard:disabled,.dshwd_save:disabled{opacity:.4;cursor:default}',
			].join('\n');
			document.head.appendChild(tag);
		}

		// ------------------------------------------------------------------ form
		/**
		 * Stage-and-commit form state over one live ConfigFormController.
		 * Staged text makes what is on screen exactly what a save would store;
		 * per-field reset clears the profile override so the field reverts to the
		 * composed (bundle patch, launch environment, or schema) value.
		 * @param scope - the Host entry's ConfigFormController.
		 */
		const UNBOUND_SNAPSHOT = { status: 'unavailable', writable: false, value: undefined, user: undefined, revision: undefined };

		function useStagedFields(scope) {
			const snapshot = React.useSyncExternalStore(
				(onChange) => (scope === null ? () => {} : scope.subscribe(onChange)),
				() => (scope === null ? UNBOUND_SNAPSHOT : scope.getSnapshot()),
				() => (scope === null ? UNBOUND_SNAPSHOT : scope.getSnapshot()),
			);
			const [staged, setStaged] = React.useState({});
			const [error, setError] = React.useState('');
			const [saving, setSaving] = React.useState(false);

			const resolved = snapshot.value ?? {};
			/** Value that would apply with no staging: user override, else effective. */
			const committed = (field) => {
				if (snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field)) {
					return String(snapshot.user[field] ?? '');
				}
				return String(resolved[field] ?? '');
			};
			const effective = (field) => {
				if (Object.prototype.hasOwnProperty.call(staged, field)) return String(staged[field]);
				return committed(field);
			};
			const overridden = (field) => Boolean(snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field));
			const edit = (field, text) => {
				setError('');
				setStaged((prev) => ({ ...prev, [field]: text }));
			};

			const resetField = async (field) => {
				if (scope === null) return;
				setStaged((prev) => {
					const next = { ...prev };
					delete next[field];
					return next;
				});
				setError('');
				try {
					const accepted = await scope.mutate([{ op: 'unset', path: [field] }]);
					if (!accepted) setError('Reset did not land; try again.');
				} catch (err) {
					setError(String((err && err.message) || err));
				}
			};

			const discard = () => {
				setStaged({});
				setError('');
			};

			const dirty = FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(staged, f.key)
				&& staged[f.key] !== committed(f.key));

			const save = async () => {
				if (scope === null || dirty.length === 0) return;
				setError('');
				setSaving(true);
				try {
					const ops = dirty.map((field) => ({
						op: 'set',
						path: [field.key],
						value: String(staged[field.key]),
					}));
					const accepted = await scope.mutate(ops);
					if (!accepted) {
						setError('The deployment did not accept these values; they were left for you to correct.');
						return;
					}
					setStaged({});
				} catch (err) {
					setError(String((err && err.message) || err));
				} finally {
					setSaving(false);
				}
			};

			return { snapshot, effective, overridden, edit, resetField, discard, dirty, save, error, saving };
		}

		// -------------------------------------------------------------- rendering
		function FieldRow(props) {
			const { f, state, baseId } = props;
			const inputId = baseId + '-' + f.key;
			const hintId = inputId + '-hint';
			const disabled = !state.snapshot.writable || state.saving;
			return React.createElement('div', { className: 'dshwd_field' },
				React.createElement('div', { className: 'dshwd_head' },
					React.createElement('label', { className: 'dshwd_label', htmlFor: inputId }, f.label),
					React.createElement('span', { className: 'dshwd_badges' },
						state.overridden(f.key) ? React.createElement('span', { className: 'dshwd_badgeMuted' }, 'override') : null,
						state.overridden(f.key) ? React.createElement('button', {
							className: 'dshwd_reset',
							type: 'button',
							disabled: disabled,
							onClick: () => { void state.resetField(f.key); },
						}, 'Reset') : null,
					),
				),
				React.createElement('input', {
					id: inputId,
					className: 'dshwd_input',
					type: 'text',
					value: state.effective(f.key),
					placeholder: f.placeholder,
					disabled,
					autoComplete: 'off',
					spellCheck: false,
					'aria-describedby': hintId,
					onChange: (event) => state.edit(f.key, event.target.value),
				}),
				React.createElement('p', { className: 'dshwd_hint', id: hintId }, f.hint),
			);
		}

		/**
		 * The row configuration page. `summary` is only requested when a bundle
		 * row has no package description; `page` renders the editable form.
		 */
		function DegoogConfigPage(props) {
			const view = props && props.view === 'summary' ? 'summary' : 'page';
			const scope = React.useContext(ScopeContext);
			const baseId = React.useId();
			const state = useStagedFields(scope);

			if (view === 'summary') {
				return React.createElement('span', null, 'Instance-backed web_search plus an SSRF-guarded direct web_fetch.');
			}
			if (state.snapshot.status === 'loading') {
				return React.createElement('p', { className: 'dshwd_note' }, 'Loading configuration…');
			}
			if (state.snapshot.status === 'unavailable') {
				return React.createElement('p', { className: 'dshwd_note' }, 'This plugin is not loaded, so it cannot be configured right now.');
			}

			const pendingLabel = state.saving
				? 'Saving…'
				: state.dirty.length > 0 ? state.dirty.length + ' unsaved' : '';
			return React.createElement('div', { className: 'dshwd_page' },
				React.createElement('p', { className: 'dshwd_lede' },
					'Changes apply to the next web_search or web_fetch; no restart is needed.',
				),
				state.snapshot.writable ? null : React.createElement('p', { className: 'dshwd_note' }, 'This deployment stores settings read-only.'),
				React.createElement('div', { className: 'dshwd_fields' },
					...FIELDS.map((f) => React.createElement(FieldRow, { key: f.key, f, state, baseId })),
				),
				React.createElement('div', { className: 'dshwd_footer' },
					state.error ? React.createElement('p', { className: 'dshwd_failed', role: 'alert' }, state.error) : null,
					pendingLabel ? React.createElement('span', { className: 'dshwd_badgeMuted' }, pendingLabel) : null,
					state.dirty.length > 0 ? React.createElement('button', {
						className: 'dshwd_discard',
						type: 'button',
						disabled: state.saving,
						onClick: state.discard,
					}, 'Discard') : null,
					React.createElement('button', {
						className: 'dshwd_save',
						type: 'button',
						disabled: state.dirty.length === 0 || !state.snapshot.writable || state.saving,
						onClick: () => { void state.save(); },
					}, 'Save'),
				),
			);
		}

		/** Carries the entry's form controller to the page component. */
		const ScopeContext = React.createContext(null);

		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		/** Services this browser plugin consumes. */
		exports.inject = ['slots', 'configForms'];

		/**
		 * Register the row's configuration page while the Host serves the entry.
		 *
		 * `plugins.row.config` is keyed by `<package name>#<row id>`; the Plugins
		 * page then shows a Configure control on the bundle's row. `whileServed`
		 * keeps the page absent on a deployment that never composed this plugin.
		 */
		exports.apply = function apply(ctx) {
			const scope = ctx.configForms.get(NS);
			ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
				name: 'plugins.row.config',
				key: ROW_KEY,
			}, (props) => React.createElement(ScopeContext.Provider, { value: scope },
				React.createElement(DegoogConfigPage, props),
			)))), 'dsh-web-degoog: configuration page');
		};

		return module.exports;
	},
});
