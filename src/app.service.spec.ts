import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const cid = 'test';
  const filename = `${cid}.json`;
  const data = { test: 'test' };

  it('should store JSON', () => {
    service.storeInvitationFile(cid, data);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(__dirname, '../storage', cid),
      JSON.stringify(data, null, 2),
    );
  });

  it('should get JSON', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(data));
    expect(service.getInvitationFile(cid)).toEqual(data);
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join(__dirname, '../storage', filename),
      'utf-8',
    );
  });
});
