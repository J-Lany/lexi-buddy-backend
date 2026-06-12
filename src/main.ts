import { NestFactory } from '@nestjs/core';
import { AppModule } from 'app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppRequest } from 'common/types/http';
import { ActivityService } from 'common/modules/activity/activity.service';
import { LastVisitInterceptor } from 'auth/interceptors/last-visit.interceptor';
import { AllExceptionsFilter } from 'common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  const activity = app.get(ActivityService);
  app.useGlobalInterceptors(new LastVisitInterceptor(activity));
  app.use(cookieParser());

  app.use(
    pinoHttp<AppRequest, Response>({
      customProps: (req) => ({
        env: process.env.APP_ENV ?? 'local',
        service: process.env.SERVICE_NAME ?? 'backend',
        request_id: req.requestId ?? null,
        user_id: req.user?.id ?? null,
      }),
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  const corsOriginsEnv = process.env.CORS_ORIGINS;
  if (!corsOriginsEnv) {
    throw new Error('CORS_ORIGINS env variable is required');
  }
  const origins = corsOriginsEnv.split(',').map((o) => o.trim());

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Request-Id'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-internal-token',
      'x-request-id',
    ],
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Lexi Buddy API')
      .setDescription('API documentation for Lexi Buddy backend')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'jwt',
      )
      .addApiKey(
        { type: 'apiKey', name: 'x-internal-token', in: 'header' },
        'internal-token',
      )
      .setVersion('1.0')
      .addTag('auth')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().then(() => console.log('Server is running'));
