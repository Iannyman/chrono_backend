export interface SessionsDataDetailedPayload {
  from: string;
  to: string;
  line_id: string;
  person_id: string;
}

export interface SessionsDataDetailedResponse {
  success: number;
  data: unknown[];
  message?: string;
}
