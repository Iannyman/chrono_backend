export interface SessionsDataDetailedPayload {
  from: string;
  to: string;
  line_id: string;
  person_id: string;
}

export interface SessionsDataEditPayload {
  from: string;
  to: string;
  line_id: string;
  log_id: string;
}

export interface SessionsDataLivePayload {
  line_id: string;
}

export interface SessionsResponse {
  success: number;
  data: unknown[];
  message?: string;
}