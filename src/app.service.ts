import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AppService {

  storeInvitationFile(cid: string, data: any): boolean {
    const filePath = path.join(__dirname, '../storage', cid);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`Could not write file ${cid}`, error);
      return false;
    }
  }

  getInvitationFile(cid: string): string | null {
    const filename = `${cid}.json`;
    const filePath = path.join(__dirname, '../storage', filename);
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Could not read contents of ${cid}`, error);
      return null;
    }
  }

}
