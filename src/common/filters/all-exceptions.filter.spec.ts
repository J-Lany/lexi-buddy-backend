import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(statusSetter: jest.Mock): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: statusSetter,
      }),
      getRequest: () => ({ method: 'GET', url: '/test' }),
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
    host = makeHost(statusMock);
  });

  it('should respond with 500 and generic message for non-HTTP exceptions', () => {
    filter.catch(new Error('Something exploded'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  });

  it('should NOT include stack trace in the 500 response body', () => {
    const error = new Error('DB connection failed');
    filter.catch(error, host);

    const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('should forward status and message from HttpException', () => {
    const httpEx = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(httpEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Not Found',
    });
  });

  it('should forward object response from HttpException (e.g. ValidationPipe 400)', () => {
    const body = {
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
    };
    const httpEx = new HttpException(body, HttpStatus.BAD_REQUEST);
    filter.catch(httpEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(body);
  });

  it('should handle thrown strings without crashing', () => {
    filter.catch('plain string error' as any, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(body.message).toBe('Internal server error');
  });
});
