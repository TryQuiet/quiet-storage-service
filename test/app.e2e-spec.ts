import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

import { InvitationDTO } from 'src/dto/invitation.dto';

import * as fs from 'fs';
import * as path from 'path';

describe('AppController (e2e)', () => {
  let app: INestApplication;

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

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/invite (PUT) validates payload schema', () => {
    return request(app.getHttpServer())
      .put(`/invite/?CID=${cid}`)
      .send({})
      .expect(400)
  });

  it('/invite (PUT) 200', () => {
    return request(app.getHttpServer())
    .put(`/invite/?CID=${cid}`)
    .send(invitationData)
    .expect(200)
  });

  it('/invite (GET) 200', () => {
    return request(app.getHttpServer())
      .get(`/invite/?CID=${cid}`)
      .expect(200)
      .expect(invitationData);
  });

  it('/invite (PUT) doesn\'t override file', () => {
    return request(app.getHttpServer())
      .put(`/invite/?CID=${cid}`)
      .send(invitationData)
      .expect(500)
      .expect({"message":"File already exists","error":"Internal Server Error","statusCode":500});
  });
});
