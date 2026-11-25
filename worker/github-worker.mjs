import {createCatalogWorker} from './catalog-worker.mjs';
import {githubAuth, githubOwner} from './github-auth.mjs';

export function createGithubCatalog(index, adminUI, githubFetch = fetch) {
  const catalog = createCatalogWorker(index, adminUI, githubOwner);
  return {
    async fetch(request, env) {
      const {pathname} = new URL(request.url);
      if (pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/api/auth/')) {
        return githubAuth(request, env, githubFetch);
      }
      return catalog.fetch(request, env);
    },
  };
}
