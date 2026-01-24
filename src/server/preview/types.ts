/**
 * Preview System Types
 *
 * Simplified types for docker-compose based preview environments.
 */

// ============================================================================
// Runtime State Types
// ============================================================================

export interface PreviewState {
  projectName: string;        // Docker compose project name (preview-{sessionId})
  previewUrl: string;         // Caddy URL
  port: number;               // External port exposed via Caddy
  composeFile: string;        // Path to docker-compose.preview.yml
  caddyRouteId?: string;
  startedAt: string;          // ISO timestamp
}

export interface CaddyRoute {
  id: string;
  host: string;
  upstreamPort: number;
}
