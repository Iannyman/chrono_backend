// --- Person (UserInfo) types ---

export interface PersonInfo {
  employeeNo: string;
  name: string;
  userType: string;
  Valid?: {
    enable: boolean;
    beginTime: string;
    endTime: string;
  };
  doorRight?: string;
  RightPlan?: Array<{
    doorNo: number;
    planTemplateNo: string;
  }>;
}

export interface CreatePersonPayload {
  UserInfo: PersonInfo;
}

export interface SearchPersonsPayload {
  UserInfoSearchCond: {
    searchID: string;
    searchResultPosition: number;
    maxResults: number;
    EmployeeNoList?: Array<{ employeeNo: string }>;
  };
}

export interface ModifyPersonPayload {
  UserInfo: Partial<PersonInfo> & { employeeNo: string };
}

export interface DeletePersonPayload {
  UserInfoDelCond: {
    EmployeeNoList: Array<{ employeeNo: string }>;
  };
}

// --- Card types ---

export interface CardInfo {
  employeeNo: string;
  cardNo: string;
  cardType: string;
}

export interface CreateCardPayload {
  CardInfo: CardInfo;
}

export interface SearchCardsPayload {
  CardInfoSearchCond: {
    searchID: string;
    searchResultPosition: number;
    maxResults: number;
    EmployeeNoList?: Array<{ employeeNo: string }>;
  };
}

export interface ModifyCardPayload {
  CardInfo: Partial<CardInfo> & { employeeNo: string };
}

export interface DeleteCardPayload {
  CardInfoDelCond: {
    EmployeeNoList: Array<{ employeeNo: string }>;
  };
}

// --- ISAPI generic response ---

export interface IsapiResponse {
  statusCode: number;
  statusString: string;
  subStatusCode: string;
  [key: string]: unknown;
}
