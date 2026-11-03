/**
 * The router answers a page address that ends in `/` with a 307 to the address
 * without it. A 307 is temporary, so search engines keep both addresses. This
 * makes that one redirect permanent and leaves every other 307 as it is.
 */
export function permanentTrailingSlashRedirect(request: Request, response: Response): Response {
  if (response.status !== 307 || (request.method !== "GET" && request.method !== "HEAD")) return response;
  const location = response.headers.get("Location");
  if (!location) return response;
  const url = new URL(request.url);
  const target = new URL(location, url);
  const trimmed = url.pathname.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === url.pathname) return response;
  if (target.origin !== url.origin || target.pathname !== trimmed || target.search !== url.search) return response;
  return new Response(null, { status: 308, headers: response.headers });
}
