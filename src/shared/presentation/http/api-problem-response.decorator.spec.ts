import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';

import { ApiProblemBadRequestResponse } from './api-problem-response.decorator.js';

@Controller('problem-response-fixture')
class ProblemResponseFixtureController {
  @Get()
  @ApiProblemBadRequestResponse({ description: 'The request is invalid.' })
  getResource(): { readonly ok: true } {
    return { ok: true };
  }
}

describe('ApiProblemResponse', () => {
  it('documents the RFC 9457 media type and reusable problem schema', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProblemResponseFixtureController],
    }).compile();
    const app = moduleRef.createNestApplication();

    await app.init();
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('Problem response test')
          .setVersion('1')
          .build(),
      );
      const response =
        document.paths['/problem-response-fixture']?.get?.responses?.['400'];

      expect(response).toMatchObject({
        description: 'The request is invalid.',
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponseDto' },
          },
        },
      });
      expect(document.components?.schemas?.ApiErrorResponseDto).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
