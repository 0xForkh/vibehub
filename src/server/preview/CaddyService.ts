/**
 * Caddy Service
 *
 * Manages dynamic Caddy routes for preview environments.
 * Uses Caddy's admin API at localhost:2019.
 */

import { logger as getLogger } from '../../shared/logger.js';

const logger = getLogger();

interface CaddyHandler {
  handler: string;
  routes?: Array<{ handle: CaddyHandler[] }>;
  upstreams?: Array<{ dial: string }>;
  response?: {
    set?: Record<string, string[]>;
  };
}

interface CaddyRouteConfig {
  '@id': string;
  match: Array<{ host: string[] }>;
  handle: CaddyHandler[];
  terminal: boolean;
}

export class CaddyService {
  private adminUrl: string;

  constructor(adminUrl = 'http://localhost:2019') {
    this.adminUrl = adminUrl;
  }

  /**
   * Detect preview domain from current Caddy config or environment
   * With flat subdomain format, we use the base domain directly (e.g., "leetlabs.ai")
   */
  async detectPreviewDomain(): Promise<string | null> {
    // Prefer environment variable for explicit configuration
    if (process.env.VIBEHUB_PREVIEW_DOMAIN) {
      return process.env.VIBEHUB_PREVIEW_DOMAIN;
    }

    try {
      const response = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`);
      if (!response.ok) {
        return null;
      }

      const routes = await response.json() as CaddyRouteConfig[];

      // Look for wildcard entries like *.leetlabs.ai or *.preview.leetlabs.ai
      for (const route of routes) {
        for (const match of route.match || []) {
          for (const host of match.host || []) {
            // Match *.preview.domain or *.domain patterns
            const previewMatch = host.match(/^\*\.preview\.(.+)$/);
            if (previewMatch) {
              return previewMatch[1]; // "leetlabs.ai" from *.preview.leetlabs.ai
            }
            const wildcardMatch = host.match(/^\*\.(.+)$/);
            if (wildcardMatch) {
              return wildcardMatch[1]; // "leetlabs.ai" from *.leetlabs.ai
            }
          }
        }
      }

      return null;
    } catch (err) {
      logger.warn('Failed to detect preview domain from Caddy', { err });
      return null;
    }
  }

  /**
   * Add a route to Caddy
   */
  async addRoute(routeId: string, host: string, upstreamPort: number): Promise<void> {
    logger.info('Adding Caddy route', { routeId, host, upstreamPort });

    const route: CaddyRouteConfig = {
      '@id': routeId,
      match: [{ host: [host] }],
      handle: [{
        handler: 'subroute',
        routes: [
          {
            // Allow embedding in iframes from any origin
            handle: [{
              handler: 'headers',
              response: {
                set: {
                  'Content-Security-Policy': ["frame-ancestors *"],
                  'X-Frame-Options': [''],  // Remove X-Frame-Options header
                },
              },
            }],
          },
          {
            handle: [{
              handler: 'reverse_proxy',
              upstreams: [{ dial: `localhost:${upstreamPort}` }],
            }],
          },
        ],
      }],
      terminal: true,
    };

    try {
      // First, get current routes to find where to insert (before wildcard)
      const getResponse = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`);
      if (!getResponse.ok) {
        throw new Error('Failed to get current routes');
      }
      const routes = await getResponse.json() as CaddyRouteConfig[];

      // Find the index of the wildcard route (*.preview.*)
      let insertIndex = routes.length; // Default to end
      for (let i = 0; i < routes.length; i += 1) {
        const hosts = routes[i].match?.[0]?.host || [];
        if (hosts.some((h: string) => h.startsWith('*.preview.'))) {
          insertIndex = i;
          break;
        }
      }

      // Insert at the position before the wildcard
      const url = insertIndex < routes.length
        ? `${this.adminUrl}/config/apps/http/servers/srv0/routes/${insertIndex}`
        : `${this.adminUrl}/config/apps/http/servers/srv0/routes`;

      // For inserting at a specific position, we need to get all routes, insert, and PATCH
      if (insertIndex < routes.length) {
        // Insert route at the correct position
        routes.splice(insertIndex, 0, route);
        // Use PATCH to replace all routes (PUT gives 409 "key already exists")
        const response = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(routes),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Caddy API error: ${response.status} ${text}`);
        }
      } else {
        // Just append if no wildcard found
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(route),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Caddy API error: ${response.status} ${text}`);
        }
      }

      logger.info('Caddy route added', { routeId, host, insertIndex });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Failed to add Caddy route', { error, routeId, host });
      throw new Error(`Failed to add Caddy route: ${error}`);
    }
  }

  /**
   * Remove a route from Caddy by its ID
   */
  async removeRoute(routeId: string): Promise<void> {
    logger.info('Removing Caddy route', { routeId });

    try {
      const response = await fetch(`${this.adminUrl}/id/${routeId}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(`Caddy API error: ${response.status} ${text}`);
      }

      logger.info('Caddy route removed', { routeId });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to remove Caddy route', { error, routeId });
      // Don't throw - route might already be removed
    }
  }

  /**
   * Check if Caddy admin API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.adminUrl}/config/`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List all routes with preview- prefix
   */
  async listPreviewRoutes(): Promise<Array<{ id: string; host: string }>> {
    try {
      const response = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`);
      if (!response.ok) {
        return [];
      }

      const routes = await response.json() as CaddyRouteConfig[];
      const previewRoutes: Array<{ id: string; host: string }> = [];

      for (const route of routes) {
        if (route['@id']?.startsWith('preview-')) {
          const host = route.match?.[0]?.host?.[0] || '';
          previewRoutes.push({ id: route['@id'], host });
        }
      }

      return previewRoutes;
    } catch {
      return [];
    }
  }

  /**
   * Generate preview URL for a branch and project
   * Uses flat subdomain format: branch-project-preview.domain
   * This works with single-level wildcard DNS (*.leetlabs.ai)
   */
  static generatePreviewUrl(branch: string, projectName: string, domain: string): string {
    // Sanitize branch name: feature/auth -> feature-auth
    const sanitizedBranch = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    return `https://${sanitizedBranch}-${projectName}-preview.${domain}`;
  }

  /**
   * Generate route ID for a branch and project
   */
  static generateRouteId(branch: string, projectName: string): string {
    const sanitizedBranch = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    return `preview-${projectName}-${sanitizedBranch}`;
  }

  /**
   * Extract host from preview URL
   */
  static extractHost(previewUrl: string): string {
    try {
      const url = new URL(previewUrl);
      return url.host;
    } catch {
      return previewUrl.replace(/^https?:\/\//, '');
    }
  }
}
