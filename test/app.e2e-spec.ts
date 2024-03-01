import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';

import { InvitationDTO } from 'src/dto/invitation.dto';

import * as fs from 'fs';
import * as path from 'path';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  let authService: AuthService;
  let jwt;

  const cid = 'testfile'

  const invitationData: InvitationDTO = {
    id: 'id',
    rootCa: 'rootCa',
    ownerCertificate: 'ownerCertificate',
    ownerOrbitDbIdentity: 'ownerOrbitDbIdentity',
    peerList: []
  }

  beforeAll(async () => {
    const filePath = path.join(__dirname, '../storage', `${cid}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authService = moduleFixture.get<AuthService>(AuthService);
    jwt = await authService.getToken();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/invite (PUT) requires authentication', () => {
    return request(app.getHttpServer())
    .put(`/invite/?CID=${cid}`)
    .send(invitationData)
    .expect(401)
  });

  it('/invite (PUT) validates payload schema', () => {
    return request(app.getHttpServer())
      .put(`/invite/?CID=${cid}`)
      .set('Authorization', `Bearer ${jwt.access_token}`)
      .send({})
      .expect(400)
  });

  it('/invite (PUT) 200', () => {
    return request(app.getHttpServer())
    .put(`/invite/?CID=${cid}`)
    .set('Authorization', `Bearer ${jwt.access_token}`)
    .send(invitationData)
    .expect(200)
  });

  it('/invite (PUT) doesn\'t override file', () => {
    return request(app.getHttpServer())
      .put(`/invite/?CID=${cid}`)
      .set('Authorization', `Bearer ${jwt.access_token}`)
      .send(invitationData)
      .expect(500)
      .expect({"message":"File already exists","error":"Internal Server Error","statusCode":500});
  });

  it('/invite (GET) requires authentication', () => {
    return request(app.getHttpServer())
      .get(`/invite/?CID=${cid}`)
      .expect(401)
  });

  it('/invite (GET) 200', () => {
    return request(app.getHttpServer())
      .get(`/invite/?CID=${cid}`)
      .set('Authorization', `Bearer ${jwt.access_token}`)
      .expect(200)
      .expect(invitationData);
  });
});
