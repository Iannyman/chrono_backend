export interface SessionsDataDetailedPayload {
  from: string;
  to: string;
  line_id: string;
  person_id: string;
}

export interface SessionsDataEditPayload {
  login_timestamp: string;
  logout_timestamp: string;
  line_id: string;
  log_id: string;
  username: string;
}

export interface SessionsDataLivePayload {
  line_id: string;
}

export interface SessionsResponse {
  success: number;
  data?: unknown[];
  message?: string;
}