// Runs synchronously in the head of every page, before first paint. It is plain JavaScript (no
// module) and the only code that can load the Google tag: the tag is requested only after the
// visitor accepted, never before and never after Reject. The stored format matches
// src/lib/core/consent.ts: {"v":1,"choice":"granted"|"denied","date":"YYYY-MM-DD"}.
(function () {
	var STORAGE_KEY = 'fair-consent';
	var VERSION = 1;
	var MAX_AGE_DAYS = 365;
	var TAG_ID = 'G-X6BJF4NQ71';
	// The cookie of this property. The tag names it _ga_ followed by the id without the prefix.
	var PROPERTY_COOKIE = '_ga_' + TAG_ID.replace('G-', '');
	var loaded = false;

	// Read by the stylesheet to hide the no-JavaScript blocks.
	document.documentElement.classList.add('js');

	window.dataLayer = window.dataLayer || [];
	function gtag() {
		window.dataLayer.push(arguments);
	}
	window.gtag = gtag;

	function consentState(value) {
		return {
			analytics_storage: value,
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied'
		};
	}
	gtag('consent', 'default', consentState('denied'));

	function storage() {
		try {
			return window.localStorage;
		} catch {
			return null;
		}
	}

	// The stored choice ("granted" or "denied"), or null when missing, malformed, from another
	// version or older than MAX_AGE_DAYS.
	function storedChoice() {
		try {
			var value = JSON.parse(storage().getItem(STORAGE_KEY));
			if (!value || value.v !== VERSION) return null;
			if (value.choice !== 'granted' && value.choice !== 'denied') return null;
			var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date);
			if (!parts) return null;
			var year = Number(parts[1]);
			var month = Number(parts[2]) - 1;
			var day = Number(parts[3]);
			var then = new Date(year, month, day);
			if (then.getFullYear() !== year || then.getMonth() !== month || then.getDate() !== day) {
				return null;
			}
			var now = new Date();
			var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
			var age = (today - Date.UTC(year, month, day)) / 86400000;
			return age > MAX_AGE_DAYS ? null : value.choice;
		} catch {
			return null;
		}
	}

	function pad(number) {
		return (number < 10 ? '0' : '') + number;
	}

	function store(choice) {
		try {
			var now = new Date();
			var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
			storage().setItem(
				STORAGE_KEY,
				JSON.stringify({ v: VERSION, choice: choice, date: date })
			);
		} catch {
			// Blocked storage: the choice then only lasts for this page view.
		}
	}

	function load() {
		if (loaded) return;
		loaded = true;
		gtag('consent', 'update', consentState('granted'));
		var script = document.createElement('script');
		script.async = true;
		script.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
		document.head.appendChild(script);
		gtag('js', new Date());
		// Cookies stay on the exact host: the parent domain runs its own property and shares _ga there.
		gtag('config', TAG_ID, { cookie_domain: window.location.hostname });
	}

	// Expires the Google Analytics cookies. The tag is configured with cookie_domain set to the host,
	// so _ga, _gid and _gat* are expired only without a domain attribute and with the exact host.
	// Parent domains may hold cookies of another property (the organization site shares _ga there),
	// so only the cookie of this property is also expired on every parent domain with at least two
	// labels.
	function deleteCookies() {
		try {
			var names = [];
			document.cookie.split(';').forEach(function (pair) {
				var name = pair.split('=')[0].trim();
				if (/^_(ga|gid|gat)/.test(name) && names.indexOf(name) < 0) names.push(name);
			});
			var host = window.location.hostname;
			var labels = host.split('.');
			var parents = [];
			for (var start = 1; start < labels.length; start++) {
				if (labels.length - start >= 2) parents.push(labels.slice(start).join('.'));
			}
			function expire(name, domain) {
				document.cookie =
					name +
					'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' +
					(domain ? '; domain=' + domain : '');
			}
			names.forEach(function (name) {
				var own = /^_ga$|^_gid$|^_gat/.test(name) || name === PROPERTY_COOKIE;
				if (!own) return;
				expire(name, '');
				expire(name, host);
				if (name === PROPERTY_COOKIE) parents.forEach(function (domain) { expire(name, domain); });
			});
		} catch {
			// Nothing to delete when cookies are not available.
		}
	}

	function stop() {
		gtag('consent', 'update', consentState('denied'));
		deleteCookies();
	}

	window.fairConsent = {
		grant: function () {
			store('granted');
			load();
		},
		deny: function () {
			store('denied');
			stop();
		},
		// Withdraws the stored choice so the visitor is asked again.
		revoke: function () {
			try {
				storage().removeItem(STORAGE_KEY);
			} catch {
				// Blocked storage: there is nothing stored to remove.
			}
			stop();
		},
		isLoaded: function () {
			return loaded;
		}
	};

	if (storedChoice() === 'granted') load();
})();
