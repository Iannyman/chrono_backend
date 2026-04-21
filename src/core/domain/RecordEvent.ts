/**
 * Represents a card access event from a Hikvision device
 */
export interface RecordEvent {
  id?: number;
  readerName: string;
  readerIp: string;
  employeeNo: string | null;
  cardNo: string;
  eventDateTime: Date;
  deviceName?: string;
  majorEventType?: number;
  subEventType?: number;
  cardReaderNo?: number;
  doorNo?: number;
  userType?: string;
  statusValue?: number;
  createdAt: Date;
}

/**
 * Raw event data received from Hikvision device
 */
export interface HikvisionEventData {
  ipAddress: string;
  portNo: number;
  protocol: string;
  dateTime: string;
  activePostCount: number;
  eventType: string;
  eventState: string;
  eventDescription: string;
  AccessControllerEvent: {
    deviceName: string;
    majorEventType: number;
    subEventType: number;
    cardNo: string;
    cardType: number;
    cardReaderNo: number;
    doorNo: number;
    employeeNoString: string;
    serialNo: number;
    userType: string;
    attendanceStatus: string;
    statusValue: number;
    picturesNumber: number;
    purePwdVerifyEnable: boolean;
  };
}

/**
 * Event creation data (without generated fields)
 */
export type CreateRecordEventDto = Omit<RecordEvent, 'id' | 'createdAt'>;

/**
 * Filter options for querying events
 */
export interface RecordEventFilter {
  readerName?: string;
  employeeNo?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
