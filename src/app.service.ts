import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AppService {

  storeInvitationFile(cid: string, data: any): { status: boolean, message?: string } {
    const filePath = path.join(__dirname, '../storage', cid);
    try {
      if (fs.existsSync(filePath)) {
        throw new Error(`File already exists`);
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { status: true };
    } catch (error) {
      console.error(`Could not write file ${cid}`, error);
      return { status: false, message: error.message };
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
