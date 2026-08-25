/**
 * dsh-web-degoog browser half: the configuration card for the
 * web-search-degoog settings namespace, registered into the Plugins
 * settings page's settings.plugin.item slot.
 *
 * Shipped as a prebuilt lazy-CJS factory (the format the harness module
 * system serves under /plugins): no JSX, no imports outside the shell-seeded
 * externals. Visual language mirrors the built-in plugin cards: the same
 * --dsw-alias-* design tokens, the same card/header/body/footer anatomy,
 * injected once through a data-plugin-css style tag.
 *
 * @module dsh-web-degoog/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-web-degoog',
	factory: (require) => {
		var module = { exports: {} };
		const React = require('react');

		const exports = module.exports;

		/** The settings namespace this card edits (the host half registers it). */
		const NS = 'web-search-degoog';
		/** Fields the card offers, with copy and input hints. */
		const FIELDS = [
			{ key: 'serverUrl', label: 'Instance URL', placeholder: 'https://degoog.example.com', hint: 'Base URL of your degoog instance. Blank keeps search unconfigured.' },
			{ key: 'apiKeyEnv', label: 'API key credential name', placeholder: 'DEGOOG_API_KEY', hint: 'Credential reference resolved per search; the key value itself never lives in settings.' },
			{ key: 'searchType', label: 'Search type', placeholder: 'web', hint: "degoog's type parameter (web, images, ... depending on installed engines)." },
			{ key: 'lang', label: 'Language', placeholder: '(none)', hint: "Optional language code passed as degoog's lang parameter." },
		];

		// ---------------------------------------------------------------- styles
		// One stylesheet, injected once; classes mirror PluginCard.module.css and
		// fields.module.css from the built-in cards over the shared tokens.
		const CSS_TAG = 'dsh-web-degoog/client.css';
		if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-web-degoog';
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = [
				'.dshwd_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
				'.dshwd_card:hover{border-color:var(--dsw-alias-label-dimmed)}',
				'.dshwd_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
				'.dshwd_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
				'.dshwd_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
				'.dshwd_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
				'.dshwd_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
				'.dshwd_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
				'.dshwd_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
				'.dshwd_chevronOpen{transform:rotate(180deg)}',
				'.dshwd_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
				'.dshwd_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}',
				'.dshwd_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
				'.dshwd_field+.dshwd_field{border-top:1px solid var(--dsw-alias-border-l2)}',
				'.dshwd_head{align-items:center;gap:8px;display:flex}',
				'.dshwd_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
				'.dshwd_badges{align-items:center;gap:8px;display:inline-flex}',
				'.dshwd_badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}',
				'.dshwd_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}',
				'.dshwd_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
				'.dshwd_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}',
				'.dshwd_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}',
				'.dshwd_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}',
				'.dshwd_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}',
				'.dshwd_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}',
				'.dshwd_discard,.dshwd_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}',
				'.dshwd_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}',
				'.dshwd_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
				'.dshwd_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
				'.dshwd_discard:disabled,.dshwd_save:disabled{opacity:.4;cursor:default}',
			].join('\n');
			document.head.appendChild(tag);
		}
		const cx = (...names) => names.filter(Boolean).join(' ');

		// ------------------------------------------------------------------ form
		/**
		 * Stage-and-commit form state over one bound scope. Staged text makes what
		 * is on screen exactly what a save would store; per-field reset clears the
		 * user override so the field reverts to composition/schema defaults.
		 */
		function useStagedFields(scope) {
			const snapshot = React.useSyncExternalStore(
				(onChange) => (scope === null ? () => {} : scope.subscribe(onChange)),
				() => (scope === null ? { status: 'loading', writable: false, value: undefined, user: undefined } : scope.getSnapshot()),
				() => ({ status: 'loading', writable: false, value: undefined, user: undefined }),
			);
			const [staged, setStaged] = React.useState({});
			const [error, setError] = React.useState('');
			const [saving, setSaving] = React.useState(false);
			const resolved = snapshot.value ?? {};
			/** Value that would apply with no staging: user override, else resolved. */
			const committed = (field) => {
				if (snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field)) return String(snapshot.user[field] ?? '');
				return String(resolved[field] ?? '');
			};
			const effective = (field) => {
				if (Object.prototype.hasOwnProperty.call(staged, field)) return String(staged[field]);
				return committed(field);
			};
			const overridden = (field) => Boolean(snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field));
			const edit = (field, text) => setStaged((prev) => ({ ...prev, [field]: text }));
			const resetField = async (field) => {
				setStaged((prev) => { const next = { ...prev }; delete next[field]; return next; });
				setError('');
				try {
					await scope.unset(field);
					const user = scope.getSnapshot().user;
					if (user && Object.prototype.hasOwnProperty.call(user, field)) {
						setError('Reset did not land; try again.');
					}
				} catch (err) {
					setError(String((err && err.message) || err));
				}
			};
			const discard = () => setStaged({});
			const dirty = FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(staged, f.key)
				&& staged[f.key] !== committed(f.key));
			const save = async () => {
				setError('');
				setSaving(true);
				try {
					for (const field of dirty) {
						await scope.set(field.key, staged[field.key]);
						const user = scope.getSnapshot().user;
						if (!user || !Object.prototype.hasOwnProperty.call(user, field.key) || String(user[field.key] ?? '') !== String(staged[field.key])) {
							setError('Save did not land; try again.');
							return;
						}
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
			const { f, state } = props;
			return React.createElement('div', { className: 'dshwd_field' },
				React.createElement('div', { className: 'dshwd_head' },
					React.createElement('span', { className: 'dshwd_label' }, f.label),
					React.createElement('span', { className: 'dshwd_badges' },
						state.overridden(f.key) ? React.createElement('span', { className: 'dshwd_badgeMuted' }, 'override') : null,
						state.overridden(f.key) ? React.createElement('button', { className: 'dshwd_reset', type: 'button', onClick: () => { void state.resetField(f.key); } }, 'Reset') : null,
					),
				),
				React.createElement('input', {
					className: 'dshwd_input',
					value: state.effective(f.key),
					placeholder: f.placeholder,
					disabled: !state.snapshot.writable || state.saving,
					onChange: (event) => state.edit(f.key, event.target.value),
				}),
				React.createElement('p', { className: 'dshwd_hint' }, f.hint),
			);
		}

		let boundScope = null;

		function DegoogCard() {
			const [open, setOpen] = React.useState(false);
			const state = useStagedFields(boundScope);
			// A deployment without the namespace shows no trace of the card.
			if (boundScope === null || state.snapshot.status !== 'ready') return null;
			const pendingLabel = state.saving ? 'Saving\u2026' : state.dirty.length > 0 ? state.dirty.length + ' unsaved' : '';
			return React.createElement('div', { className: cx('dshwd_card', open && 'dshwd_cardOpen') },
				React.createElement('button', { className: 'dshwd_header', type: 'button', onClick: () => setOpen((v) => !v) },
					React.createElement('span', { className: 'dshwd_headText' },
						React.createElement('span', { className: 'dshwd_name' }, 'degoog search & fetch'),
						React.createElement('span', { className: 'dshwd_description' }, 'Instance-backed web_search plus an SSRF-guarded direct web_fetch.'),
					),
					pendingLabel ? React.createElement('span', { className: 'dshwd_pending' }, pendingLabel) : null,
					React.createElement('span', { className: cx('dshwd_chevron', open && 'dshwd_chevronOpen') }, '\u25BE'),
				),
				open ? React.createElement('div', { className: 'dshwd_body' },
					...FIELDS.map((f) => React.createElement(FieldRow, { key: f.key, f, state })),
					React.createElement('div', { className: 'dshwd_footer' },
						state.error ? React.createElement('p', { className: 'dshwd_failed' }, state.error) : null,
						state.dirty.length > 0 ? React.createElement('button', { className: 'dshwd_discard', type: 'button', disabled: state.saving, onClick: state.discard }, 'Discard') : null,
						React.createElement('button', {
							className: 'dshwd_save',
							type: 'button',
							disabled: state.dirty.length === 0 || !state.snapshot.writable || state.saving,
							onClick: () => { void state.save(); },
						}, 'Save'),
					),
				) : null,
			);
		}

		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		/** Services this browser plugin consumes. */
		exports.inject = ['slots', 'settingsScope'];

		/**
		 * Register the card; the tab pairs it with our Host-registered namespace.
		 *
		 * settings.plugin.item is declared by the Plugins tab, which can mount
		 * after this plugin. slots.inject waits for that declaration, re-runs on
		 * redeclaration, and tears down on collapse — the public wait path.
		 */
		exports.apply = function apply(ctx) {
			boundScope = ctx.settingsScope.bind({ namespace: NS });
			ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', key: NS }, DegoogCard));
		};

		return module.exports;
	},
});
