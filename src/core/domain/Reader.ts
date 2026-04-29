/**
 * Represents a card reader device
 */
export interface Reader {
  id?: number;
  name: string;
  ip: string;
  isOnline: boolean;
  lastEventDateTime: Date | null;
  lastError: string | null;
  updatedAt: Date;
}

/**
 * Reader status update data
 */
export interface ReaderStatusUpdate {
  isOnline: boolean;
  lastError?: string | null;
  lastEventDateTime?: Date | null;
}

/**
 * Reader configuration (from config file)
 */
export interface ReaderConfig {
  name: string;
  ip: string;
  port?: number;
}

/**
 * A single reader entry returned from SQL stored procedure
 */
export interface SqlReaderItem {
  name: string;
  ip: string;
}

/**
 * Response envelope from dbo.DC_chronos_sp_get_line_logger_mapping
 */
export interface SqlReadersResponse {
  success: number;
  data: SqlReaderItem[];
  message?: string;
}
