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

export interface SessionsDataDeletePayload {
  log_id: string;
  username: string;
}

export interface CreateReaderPayload {
  logger_ip: string;
  line_id: string;
}

export interface SessionsDataLivePayload {
  line_id: string;
}

export interface SQLResponse {
  success: number;
  data?: unknown[];
  message?: string;
}