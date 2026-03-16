export type ServiceStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResponse {
  status: ServiceStatus;
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: ServiceHealthDetail;
    redis: ServiceHealthDetail;
    queues: ServiceHealthDetail;
  };
}

export interface ServiceHealthDetail {
  status: ServiceStatus;
  latencyMs?: number;
  message?: string;
}
