import sql from 'mssql';
import { config } from '../../config/index.js';
import { logger } from '../logging/logger.js';
import type { RecordEvent } from '../../core/domain/RecordEvent.js';
import type { SqlReadersResponse, ReaderConfig } from '../../core/domain/index.js';
import type { SessionsDataDetailedPayload, SessionsDataDetailedResponse } from '../../core/domain/Session.js';
import { alertService } from '../../core/services/AlertService.js';

export class SqlService {
  private pool?: sql.ConnectionPool;

  async connect(): Promise<void> {
    this.pool = await sql.connect({
      server: config.db.server,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
      },
      connectionTimeout: config.db.connectionTimeout,
      requestTimeout: config.db.requestTimeout,
    });

    logger.info({
      server: config.db.server,
      database: config.db.database,
    }, 'Connected to SQL Server');
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
      logger.info('Disconnected from SQL Server');
    }
  }

  async insertLoginEvent(event: RecordEvent): Promise<void> {
    if (!this.pool) {
      throw new Error('SQL Server not connected');
    }

    const personId = parseInt(event.employeeNo ?? '', 10);
    if (isNaN(personId)) {
      logger.warn({ employeeNo: event.employeeNo }, 'Skipping event: invalid person_id');
      return;
    }

    // Build the JSON payload you want to send to SQL
    const payload = {
      person_id: personId,
      reader_ip: event.readerIp,
      login_timestamp: event.eventDateTime
    };

    // console.log(JSON.stringify(payload));

    const request = this.pool.request();

    // Send JSON to SQL Server
    request.input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload));

    // Receive JSON from SQL Server
    request.output('result', sql.NVarChar(sql.MAX));

    const result = await request.execute('dbo.DC_chronos_sp_insert_chronos_login');

    // Parse JSON OUTPUT
    const response = JSON.parse(result.output.result);

    if (!response.success) {
      logger.error({
        personId,
        readerIP: event.readerIp,
        login_timestamp: event.eventDateTime,
        sqlResponse: response
      }, 'Stored procedure returned error');

      // Send email alert
      alertService.sendSystemAlert(response.message , 'SQL Event');

      throw new Error(response.message ?? 'Stored procedure returned failure');
    } else {
      // logger.info({
      //   personId,
      //   readerIP: event.readerIp,
      //   login_timestamp: event.eventDateTime,
      //   sqlResponse: response
      // }, 'Stored procedure returned success');
    }
  }


  async insertBatch(events: RecordEvent[]): Promise<void> {
    logger.info({ count: events.length }, 'Inserting batch of events to SQL Server');

    let successCount = 0;
    let failCount = 0;

    for (const event of events) {
      try {
        await this.insertLoginEvent(event);
        successCount++;
      } catch (error) {
        failCount++;
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          readerIp: event.readerIp,
          login_timestamp: event.eventDateTime,
          employeeNo: event.employeeNo,
        }, 'Failed to insert event');

        // Send email alert
        const emailMessage = error instanceof Error ? error.message : String(error);
        alertService.sendSystemAlert(emailMessage, 'SQL Connection');
      }
    }

    logger.info({ successCount, failCount, total: events.length }, 'Batch insert completed');

    if (failCount > 0) {
      throw new Error(`Batch insert failed: ${failCount}/${events.length} events could not be inserted`);
    }
  }

  async getReaders(): Promise<ReaderConfig[]> {
    if (!this.pool) {
      throw new Error('SQL Server not connected');
    }

    const request = this.pool.request();

    // Receive JSON from SQL Server
    request.output('result', sql.NVarChar(sql.MAX));

    const result = await request.execute('dbo.DC_chronos_sp_get_line_logger_mapping');

    // Parse JSON OUTPUT
    let response: SqlReadersResponse;
    try {
      response = JSON.parse(result.output.result);
    } catch (parseError) {
      logger.error({
        rawResult: result.output.result,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      }, 'Failed to parse readers stored procedure response as JSON');
      throw new Error('Invalid JSON response from readers stored procedure');
    }

    if (!response || typeof response !== 'object' || !Array.isArray(response.data)) {
      logger.error({ sqlResponse: response }, 'Readers stored procedure returned unexpected shape');
      throw new Error('Readers stored procedure response missing expected data array');
    }

    if (!response.success) {
      logger.error({
        sqlResponse: response
      }, 'Stored procedure returned error');

      throw new Error(response.message ?? 'Stored procedure returned failure');
    }

    logger.info({
      readerCount: response.data.length,
      readers: response.data.map(r => r.name)
    }, 'Readers loaded from SQL Server');

    return response.data;
  }

  async getSessionsDataDetailed(
    payload: SessionsDataDetailedPayload[]
  ): Promise<SessionsDataDetailedResponse> {
    if (!this.pool) {
      throw new Error('SQL Server not connected');
    }

    const request = this.pool.request();

    request.input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload));
    request.output('result', sql.NVarChar(sql.MAX));

    const result = await request.execute(
      'dbo.DC_chronos_sp_get_sessions_data_detailed'
    );

    let response: SessionsDataDetailedResponse;
    try {
      response = JSON.parse(result.output.result);
    } catch (parseError) {
      logger.error({
        rawResult: result.output.result,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      }, 'Failed to parse sessions data detailed SP response as JSON');
      throw new Error('Invalid JSON response from sessions data detailed SP');
    }

    if (!response || typeof response !== 'object' || !Array.isArray(response.data)) {
      logger.error({ sqlResponse: response }, 'Sessions data detailed SP returned unexpected shape');
      throw new Error('Sessions data detailed SP response missing expected data array');
    }

    if (!response.success) {
      logger.error({ sqlResponse: response }, 'Sessions data detailed SP returned error');
      throw new Error(response.message ?? 'Stored procedure returned failure');
    }

    return response;
  }
}

export const sqlService = new SqlService();
