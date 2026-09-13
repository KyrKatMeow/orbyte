export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        let path = url.pathname;
        const method = request.method.toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
            return env.ASSETS.fetch(request);
        }
        const ua = request.headers.get('user-agent') || '';
        const mobileHint = request.headers.get('sec-ch-ua-mobile') === '?1';
        const forceDesktop = url.searchParams.get('desktop') === '1';
        const forceMobile = url.searchParams.get('mobile') === '1';
        const looksMobile = mobileHint ||
            /Android|iPhone|iPod|iPad|IEMobile|Opera Mini|Mobile/i.test(ua) ||
            (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));
        const useMobile = !forceDesktop && (forceMobile || looksMobile);
        const assetRequest = pathname => {
            const assetUrl = new URL(request.url);
            assetUrl.pathname = pathname;
            assetUrl.search = '';
            return new Request(assetUrl, {
                method,
                headers: request.headers,
                redirect: 'manual'
            });
        };
        const fetchAssetFinal = async (pathname, maxRedirects = 5) => {
            let current = pathname;
            for (let i = 0; i <= maxRedirects; i++) {
                const response = await env.ASSETS.fetch(assetRequest(current));
                if (response.status < 300 || response.status >= 400) {
                    return response;
                }
                const location = response.headers.get('Location');
                if (!location)
                    return response;
                const next = new URL(location, url);
                if (next.origin !== url.origin)
                    return response;
                if (next.pathname === current) {
                    return new Response('Asset routing loop', {
                        status: 508,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }
                current = next.pathname;
            }
            return new Response('Too many internal asset redirects', {
                status: 508,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        };
        const wrapped = (response, extra = {}) => {
            const headers = new Headers(response.headers);
            headers.delete('Location');
            headers.set('X-Orbyte-Router', 'R190.2');
            for (const [key, value] of Object.entries(extra)) {
                headers.set(key, String(value));
            }
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        };
        const serveAppShell = async () => {
            let response = await fetchAssetFinal(useMobile ? '/mobile' : '/');
            if (response.status === 404) {
                response = await fetchAssetFinal(useMobile ? '/mobile.html' : '/index.html');
            }
            return wrapped(response, {
                'X-Orbyte-App-Route': path,
                'X-Orbyte-Client': useMobile ? 'mobile' : 'desktop'
            });
        };
        const serveServerPage = async (encodedSlug) => {
            let slug = encodedSlug;
            try {
                slug = decodeURIComponent(encodedSlug);
            }
            catch { }
            let response = await fetchAssetFinal('/server-page');
            if (response.status === 404) {
                response = await fetchAssetFinal('/server-page.html');
            }
            if (method === 'HEAD' || !response.ok) {
                return wrapped(response, { 'X-Orbyte-Server-Slug': slug });
            }
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) {
                return wrapped(response, { 'X-Orbyte-Server-Slug': slug });
            }
            const transformed = new HTMLRewriter()
                .on('[data-orbyte-server-public]', {
                element(element) {
                    element.setAttribute('data-slug', slug);
                }
            })
                .transform(response);
            return wrapped(transformed, { 'X-Orbyte-Server-Slug': slug });
        };
        if (/\/{2,}/.test(path)) {
            const normalized = path.replace(/\/{2,}/g, '/');
            const target = new URL(normalized, url);
            target.search = url.search;
            return Response.redirect(target.toString(), 302);
        }
        if (path === '/') {
            return serveAppShell();
        }
        if (path === '/index.html') {
            const response = await fetchAssetFinal('/');
            return wrapped(response);
        }
        if (path === '/mobile.html') {
            let response = await fetchAssetFinal('/mobile');
            if (response.status === 404)
                response = await fetchAssetFinal('/mobile.html');
            return wrapped(response);
        }
        const APP_ROUTE = path === '/friends' || path === '/friends/' ||
            path === '/feed' || path === '/feed/' ||
            path === '/plus' || path === '/plus/' ||
            path === '/message-requests' || path === '/message-requests/' ||
            path === '/gifts' || path === '/gifts/' ||
            path === '/oauth2/authorize' || path === '/oauth2/authorize/' ||
            /^\/gifts\/[^/]+\/?$/i.test(path) ||
            /^\/channels\/[^/]+\/?$/i.test(path) ||
            /^\/dms\/[^/]+\/?$/i.test(path) ||
            /^\/users\/[^/]+\/?$/i.test(path) ||
            /^\/settings(?:\/[^/]+)?\/?$/i.test(path) ||
            /^\/invites\/[^/]+\/?$/i.test(path) ||
            /^\/plus-trial\/[^/]+\/?$/i.test(path);
        if (APP_ROUTE) {
            return serveAppShell();
        }
        if (path === '/servers' || path === '/servers/') {
            let response = await fetchAssetFinal('/servers');
            if (response.status === 404)
                response = await fetchAssetFinal('/servers.html');
            return wrapped(response);
        }
        const serverMatch = path.match(/^\/servers\/([^/]+)\/?$/i);
        if (serverMatch) {
            return serveServerPage(serverMatch[1]);
        }
        return wrapped(await env.ASSETS.fetch(request));
    }
};
