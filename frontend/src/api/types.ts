/** Health check response */
export interface HealthResponse {
  status: string;
  version: string;
  nec2c_available: boolean;
  environment: string;
}
