// Viewer-request function: the SvelteKit build (adapter-static, trailingSlash: 'never')
// emits flat files such as `en.html`, `en/about.html` and `en/tools/f-uji.html`, while
// every link in the app is extensionless (`/en`, `/en/about`, `/en/tools/f-uji`). S3 does
// not map those on its own, so this rewrites the request URI before it reaches the origin.
//
// Rules:
//   "/"                  -> "/index.html" (the redirect stub that sends visitors to a locale)
//   other trailing "/"   -> slashes removed, ".html" appended ("/en/" -> "/en.html"),
//                           because the build has no per-directory index.html files
//   last segment has no "." -> ".html" appended ("/en/about" -> "/en/about.html")
//   anything with a file extension is passed through unchanged ("/favicon.svg")
function handler(event) {
	var request = event.request;
	var uri = request.uri;

	if (uri === '/') {
		request.uri = '/index.html';
		return request;
	}

	if (uri.charAt(uri.length - 1) === '/') {
		request.uri = uri.replace(/\/+$/, '') + '.html';
		return request;
	}

	var lastSegment = uri.slice(uri.lastIndexOf('/') + 1);
	if (lastSegment.indexOf('.') === -1) {
		request.uri = uri + '.html';
	}

	return request;
}
