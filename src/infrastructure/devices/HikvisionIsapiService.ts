import DigestFetch from 'digest-fetch';
import { config } from '../../config/index.js';
import { activeReaders as readers } from '../../config/readers.js';
import { logger } from '../logging/logger.js';
import { HttpError } from '../../api/middleware/errorHandler.js';
import type {
  CreatePersonPayload,
  SearchPersonsPayload,
  ModifyPersonPayload,
  DeletePersonPayload,
  CreateCardPayload,
  SearchCardsPayload,
  ModifyCardPayload,
  DeleteCardPayload,
  IsapiResponse,
} from '../../core/domain/IsapiTypes.js';

export class HikvisionIsapiService {
  private readonly client: DigestFetch;
  private readonly baseUrl: string;
  private readonly readerName: string;

  private constructor(readerName: string, ip: string, username: string, password: string) {
    this.readerName = readerName;
    this.client = new DigestFetch(username, password);
    this.baseUrl = `http://${ip}`;
  }

  static forReader(readerName: string): HikvisionIsapiService {
    const reader = readers.find(r => r.name === readerName);
    if (!reader) {
      throw new HttpError(`Reader "${readerName}" not found in configuration`, 404);
    }
    return new HikvisionIsapiService(readerName, reader.ip, config.device.user, config.device.password);
  }

  // --- Person endpoints ---

  async createPerson(payload: CreatePersonPayload): Promise<IsapiResponse> {
    return this.post('/ISAPI/AccessControl/UserInfo/Record?format=json', payload);
  }

  async searchPersons(payload: SearchPersonsPayload): Promise<IsapiResponse> {
    return this.post('/ISAPI/AccessControl/UserInfo/Search?format=json', payload);
  }

  async modifyPerson(payload: ModifyPersonPayload): Promise<IsapiResponse> {
    return this.put('/ISAPI/AccessControl/UserInfo/Modify?format=json', payload);
  }

  async deletePerson(payload: DeletePersonPayload): Promise<IsapiResponse> {
    return this.put('/ISAPI/AccessControl/UserInfo/Delete?format=json', payload);
  }

  // --- Card endpoints ---

  async createCard(payload: CreateCardPayload): Promise<IsapiResponse> {
    return this.post('/ISAPI/AccessControl/CardInfo/Record?format=json', payload);
  }

  async searchCards(payload: SearchCardsPayload): Promise<IsapiResponse> {
    return this.post('/ISAPI/AccessControl/CardInfo/Search?format=json', payload);
  }

  async modifyCard(payload: ModifyCardPayload): Promise<IsapiResponse> {
    return this.put('/ISAPI/AccessControl/CardInfo/Modify?format=json', payload);
  }

  async deleteCard(payload: DeleteCardPayload): Promise<IsapiResponse> {
    return this.put('/ISAPI/AccessControl/CardInfo/Delete?format=json', payload);
  }

  // --- Private helpers ---

  private async post(path: string, body: unknown): Promise<IsapiResponse> {
    return this.request('POST', path, body);
  }

  private async put(path: string, body: unknown): Promise<IsapiResponse> {
    return this.request('PUT', path, body);
  }

  private async request(method: string, path: string, body: unknown): Promise<IsapiResponse> {
    const url = `${this.baseUrl}${path}`;
    const startTime = Date.now();

    logger.info({ reader: this.readerName, method, path }, 'ISAPI request');

    const response = await this.client.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();

      // Try to parse as JSON — return device error in same format as success
      try {
        return JSON.parse(text) as IsapiResponse;
      } catch {
        throw new HttpError(`ISAPI request failed: HTTP ${response.status} - ${text}`, 502);
      }
    }

    const data = await response.json();

    logger.info({
      reader: this.readerName, method, path, duration,
      data,
    }, 'ISAPI response');

    return data;
  }
}
