/**
 * dsh-web-degoog browser half: the configuration card for the
 * web-search-degoog settings namespace, registered into the Plugins
 * settings page's settings.plugin.item slot.
 *
 * Shipped as a prebuilt lazy-CJS factory (the format the harness module
 * system serves under /plugins): no JSX, no imports outside the shell-seeded
 * externals. Services arrive through the exported inject; the card talks to
 * the Host through the bound settings scope (reads ride the describe mirror,
 * writes are revision-fenced field sets).
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

		/**
		 * Stage-and-commit form state over one bound scope. Staged text makes what
		 * is on screen exactly what a save would store; per-field reset clears the
		 * user override so the field reverts to composition/schema defaults.
		 */
		function useStagedFields(scope) {
			const snapshot = React.useSyncExternalStore(
				(onChange) => scope.subscribe(onChange),
				() => scope.getSnapshot(),
				() => ({ status: 'loading', writable: false, value: undefined, user: undefined }),
			);
			const [staged, setStaged] = React.useState({});
			React.useEffect(() => {
				// A committed write moved the section; drop stale staging.
				setStaged({});
			}, [snapshot.revision]);
			const resolved = snapshot.value ?? {};
			const effective = (field) => {
				if (Object.prototype.hasOwnProperty.call(staged, field)) return String(staged[field]);
				if (snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field)) return String(snapshot.user[field] ?? '');
				return String(resolved[field] ?? '');
			};
			const overridden = (field) => Boolean(snapshot.user && Object.prototype.hasOwnProperty.call(snapshot.user, field));
			const edit = (field, text) => setStaged((prev) => ({ ...prev, [field]: text }));
			const resetField = async (field) => {
				setStaged((prev) => { const next = { ...prev }; delete next[field]; return next; });
				await scope.unset(field);
			};
			const discard = () => setStaged({});
			const dirty = FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(staged, f.key)
				&& staged[f.key] !== effective(f.key));
			const save = async () => {
				for (const field of dirty) await scope.set(field.key, staged[field.key]);
				setStaged({});
			};
			return { snapshot, effective, overridden, edit, resetField, discard, dirty, save };
		}

		const styles = {
			card: { border: '1px solid var(--dsh-border, #ccc)', borderRadius: 8, padding: '12px 14px', margin: '10px 0', display: 'grid', gap: 10 },
			title: { fontWeight: 600, fontSize: 13, letterSpacing: 0.2 },
			desc: { opacity: 0.75, fontSize: 12, lineHeight: 1.4 },
			field: { display: 'grid', gap: 3 },
			labelRow: { display: 'flex', alignItems: 'baseline', gap: 6 },
			label: { fontSize: 11, opacity: 0.85 },
			hint: { fontSize: 11, opacity: 0.55 },
			input: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--dsh-border, #bbb)', background: 'transparent', color: 'inherit', font: 'inherit' },
			row: { display: 'flex', alignItems: 'center', gap: 8 },
			button: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--dsh-border, #bbb)', background: 'var(--dsh-accent, #4a6df0)', color: '#fff', cursor: 'pointer', font: 'inherit' },
			ghost: { padding: '2px 8px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'inherit', opacity: 0.7, cursor: 'pointer', font: 'inherit' },
		};

		function OverriddenBadge(props) {
			const { state, field } = props;
			if (!state.overridden(field)) return null;
			return React.createElement('span', { style: styles.row },
				React.createElement('span', { style: styles.hint }, '(override -'),
				React.createElement('button', { style: styles.ghost, type: 'button', onClick: () => { void state.resetField(field); } }, 'reset'),
				React.createElement('span', { style: styles.hint }, 'to default)'),
			);
		}

		function FieldRow(props) {
			const { f, state } = props;
			return React.createElement('label', { style: styles.field },
				React.createElement('span', { style: styles.labelRow },
					React.createElement('span', { style: styles.label }, f.label),
					React.createElement(OverriddenBadge, { state, field: f.key }),
				),
				React.createElement('input', {
					style: styles.input,
					value: state.effective(f.key),
					placeholder: f.placeholder,
					disabled: !state.snapshot.writable || state.snapshot.status !== 'ready',
					onChange: (event) => state.edit(f.key, event.target.value),
				}),
				React.createElement('span', { style: styles.hint }, f.hint),
			);
		}

		let boundScope = null;

		function DegoogCard() {
			const state = boundScope === null ? null : useStagedFields(boundScope);
			if (state === null || state.snapshot.status === 'loading') {
				return React.createElement('div', { style: styles.card }, 'degoog: loading settings...');
			}
			if (state.snapshot.status === 'unavailable') {
				return React.createElement('div', { style: styles.card }, 'degoog: settings are not available on this connection.');
			}
			return React.createElement('div', { style: styles.card },
				React.createElement('div', null,
					React.createElement('div', { style: styles.title }, 'degoog search & fetch'),
					React.createElement('div', { style: styles.desc }, 'Instance-backed web_search plus an SSRF-guarded direct web_fetch.'),
				),
				FIELDS.map((f) => React.createElement(FieldRow, { key: f.key, f, state })),
				React.createElement('div', { style: styles.row },
					React.createElement('button', {
						style: styles.button,
						type: 'button',
						disabled: state.dirty.length === 0 || !state.snapshot.writable,
						onClick: () => { void state.save(); },
					}, state.dirty.length === 0 ? 'Saved' : 'Save ' + state.dirty.length + ' change(s)'),
					state.dirty.length > 0 ? React.createElement('button', { style: styles.ghost, type: 'button', onClick: state.discard }, 'Discard') : null,
				),
			);
		}

		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		/** Services this browser plugin consumes. */
		exports.inject = ['slots', 'settingsScope'];

		/** Register the card; the tab pairs it with our Host-registered namespace. */
		exports.apply = function apply(ctx) {
			boundScope = ctx.settingsScope.bind({ namespace: NS });
			ctx.effect(() => ctx.slots.register({ name: 'settings.plugin.item', key: NS }, DegoogCard));
		};

		return module.exports;
	},
});
