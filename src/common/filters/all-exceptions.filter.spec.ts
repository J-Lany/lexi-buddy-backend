import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from 'common/errors/app-exception';

function makeHost(statusSetter: jest.Mock, requestId?: string): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: statusSetter,
      }),
      getRequest: () => ({ method: 'GET', url: '/test', requestId }),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = makeHost(statusMock, 'req-abc-123');
  });

  it('should respond with 500 INTERNAL_ERROR for non-HTTP exceptions', () => {
    filter.catch(new Error('Something exploded'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      requestId: 'req-abc-123',
    });
  });

  it('should NOT include message, stack trace, or the raw exception in the response body', () => {
    const error = new Error('DB connection failed at host db.internal:5432');
    filter.catch(error, host);

    const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('internalReason');
    expect(JSON.stringify(body)).not.toContain('at ');
    expect(JSON.stringify(body)).not.toContain('db.internal');
  });

  it('should map a legacy NotFoundException to { statusCode: 404, code: NOT_FOUND }', () => {
    filter.catch(new NotFoundException('some internal detail'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      code: 'NOT_FOUND',
      requestId: 'req-abc-123',
    });
  });

  it('should NOT forward exception.getResponse() for a legacy HttpException with an object body (e.g. default ValidationPipe shape)', () => {
    const body = {
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
    };
    const httpEx = new HttpException(body, HttpStatus.BAD_REQUEST);
    filter.catch(httpEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_FAILED',
      requestId: 'req-abc-123',
    });
  });

  it('should handle thrown strings without crashing, as INTERNAL_ERROR', () => {
    filter.catch('plain string error' as unknown, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body).not.toHaveProperty('message');
  });

  it("should use 'unknown' as requestId when the middleware never set one", () => {
    const hostNoReqId = makeHost(statusMock, undefined);
    filter.catch(new BadRequestException(), hostNoReqId);

    const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(body.requestId).toBe('unknown');
  });

  // ─── AppException ──────────────────────────────────────────────────────

  describe('AppException', () => {
    it('produces { statusCode, code, requestId } from the exception, never getResponse()', () => {
      const ex = new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_INVALID_CREDENTIALS',
      );

      filter.catch(ex, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'AUTH_INVALID_CREDENTIALS',
        requestId: 'req-abc-123',
      });
    });

    it('includes only the pre-typed safe `details` — never the internalReason', () => {
      const ex = new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', {
        details: { fields: [{ field: 'email', code: 'INVALID_EMAIL' }] },
        internalReason: 'raw class-validator constraint: isEmail',
      });

      filter.catch(ex, host);

      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        requestId: 'req-abc-123',
        details: { fields: [{ field: 'email', code: 'INVALID_EMAIL' }] },
      });
      const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('isEmail');
    });

    it('does not copy an arbitrary exception object into details', () => {
      const ex = new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED');
      (ex as unknown as { extra: unknown }).extra = {
        password: 'leaked-if-copied',
      };

      filter.catch(ex, host);

      const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('leaked-if-copied');
      expect(body).not.toHaveProperty('extra');
    });
  });

  // ─── Throttling ─────────────────────────────────────────────────────────

  it('maps ThrottlerException to 429 RATE_LIMITED', () => {
    filter.catch(new ThrottlerException(), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
      requestId: 'req-abc-123',
    });
  });
});
